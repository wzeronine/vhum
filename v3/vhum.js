/**
 * vhum v3 - Client-side behavioral biometric analysis
 * Detects bot behavior via mouse/touch bioanalysis
 * 
 * @author wzeronine
 * @version 3.0.0
 * 
 * Usage:
 *   const vhum = new Vhum({ threshold: 0.68 });
 *   vhum.on('result', (data) => {
 *     console.log(data.probability, data.verdict); // 0.45, 1 (human)
 *   });
 */

class InputTypeDetector {
    static TYPES = {
        MOUSE: 'mouse',
        TOUCH: 'touch',
        UNKNOWN: 'unknown'
    };

    static detect(points, inputSource) {
        if (inputSource === 'touch') return this.TYPES.TOUCH;
        if (inputSource === 'mouse') return this.TYPES.MOUSE;
        
        if (points.length < 10) return this.TYPES.UNKNOWN;

        const jitterAnalysis = this._analyzeJitterPattern(points);
        const dwellAnalysis = this._analyzeDwellCharacteristics(points);
        const speedProfile = this._analyzeSpeedProfile(points);

        const touchScore = (jitterAnalysis.highVariance * 0.3) + 
                          (dwellAnalysis.largeContactArea * 0.3) + 
                          (speedProfile.smoothProfile * 0.2) + 
                          (speedProfile.lowPrecision * 0.2);

        const mouseScore = (jitterAnalysis.precisionPattern * 0.3) + 
                          (dwellAnalysis.pointContact * 0.3) + 
                          (speedProfile.sharpProfile * 0.2) + 
                          (speedProfile.highPrecision * 0.2);

        return touchScore > mouseScore ? this.TYPES.TOUCH : this.TYPES.MOUSE;
    }

    static _analyzeJitterPattern(points) {
        let dts = [];
        for (let i = 1; i < points.length; i++) dts.push(Math.max(0.1, points[i].t - points[i-1].t));
        
        const dtVariance = dts.reduce((a,b) => a + Math.pow(b - (dts.reduce((x,y)=>x+y)/dts.length), 2), 0) / dts.length;
        const dtStdDev = Math.sqrt(dtVariance);
        const dtMean = dts.reduce((a,b)=>a+b)/dts.length;
        const dtCV = dtStdDev / dtMean;

        return {
            highVariance: Math.min(1, dtCV / 0.15),
            precisionPattern: Math.max(0, 1 - dtCV / 0.08)
        };
    }

    static _analyzeDwellCharacteristics(points) {
        if (points.length < 5) return { largeContactArea: 0.5, pointContact: 0.5 };

        let distances = [];
        const centroid = {
            x: points.reduce((a,b) => a + b.x, 0) / points.length,
            y: points.reduce((a,b) => a + b.y, 0) / points.length
        };

        for (let i = 0; i < points.length; i++) {
            distances.push(Math.hypot(points[i].x - centroid.x, points[i].y - centroid.y));
        }

        const avgDist = distances.reduce((a,b)=>a+b)/distances.length;
        const maxDist = Math.max(...distances);
        const spreadArea = maxDist > 15; 

        return {
            largeContactArea: spreadArea ? 0.8 : 0.2,
            pointContact: spreadArea ? 0.2 : 0.8
        };
    }

    static _analyzeSpeedProfile(points) {
        if (points.length < 3) return { smoothProfile: 0.5, sharpProfile: 0.5, lowPrecision: 0.5, highPrecision: 0.5 };

        let speeds = [];
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i-1].x;
            const dy = points[i].y - points[i-1].y;
            const dtMs = Math.max(8, points[i].t - points[i-1].t); // min 8 ms
            const dt = dtMs / 1000; // seconds
            speeds.push(Math.sqrt(dx*dx + dy*dy) / dt);
        }

        const mean = speeds.reduce((a,b)=>a+b,0)/speeds.length;
        const speedVar = speeds.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / speeds.length;
        const speedStd = Math.sqrt(speedVar || 0);
        const speedCV = Math.abs(mean) > 1e-6 ? speedStd / mean : 0;

        return {
            smoothProfile: Math.min(1, speedCV / 0.5),
            sharpProfile: Math.max(0, 1 - speedCV / 0.3),
            lowPrecision: Math.min(1, speedCV / 0.6),
            highPrecision: Math.max(0, 1 - speedCV / 0.4)
        };
    }
}

class AdaptivePerceptron {
    constructor(inputType = 'mouse') {
        this.inputType = inputType;
        this._initializeWeights();
    }

    _initializeWeights() {
        if (this.inputType === InputTypeDetector.TYPES.TOUCH) {
            this.weights = {
                fitts: 1.6,
                temporal: 1.3,
                decision: 1.7,
                jitter: 0.35,
                dwell: 0.75,
                speed: 0.35,
                accel: 0.4,
                curvature: 0.25,
                entropy: 0.2,
                pauses: 1.0
            };
            this.bias = -2.6;
        } else {
            this.weights = {
                fitts: 2.2,
                temporal: 2.1,
                decision: 2.3,
                jitter: 0.9,
                dwell: 1.4,
                speed: 0.5,
                accel: 0.6,
                curvature: 0.4,
                entropy: 0.3,
                pauses: 1.7
            };
            this.bias = -3.2;
        }
    }

    sigmoid(z) {
        return 1 / (1 + Math.exp(-Math.max(-100, Math.min(100, z))));
    }

    predict(inputs) {
        let z = this.bias;
        for (let key in inputs) {
            const w = this.weights[key] || 0;
            z += (inputs[key] || 0) * w;
        }
        this.lastZ = z;
        const p = this.sigmoid(z);
        this.lastP = p;
        return p;
    }
}

class Vhum {
    constructor(options = {}) {
        // Options
        this.options = {
            thresholdMouse: options.thresholdMouse !== undefined ? options.thresholdMouse : 0.68,
            thresholdTouch: options.thresholdTouch !== undefined ? options.thresholdTouch : 0.62,
            container: options.container || '#vhum-area',
            checkbox: options.checkbox || '#main-check',
            ...options
        };

        // DOM Elements
        this.area = typeof this.options.container === 'string' 
            ? document.querySelector(this.options.container) 
            : this.options.container;
        
        this.check = typeof this.options.checkbox === 'string' 
            ? document.querySelector(this.options.checkbox) 
            : this.options.checkbox;

        if (!this.area || !this.check) {
            console.error('Vhum: Required elements not found. Check selectors:', 
                this.options.container, this.options.checkbox);
            return;
        }

        // State
        this.points = [];
        this.isTracking = false;
        this.t_entry = 0;
        this.t_down = 0;
        this.entry_pos = { x: 0, y: 0 };
        
        this.lastInputSource = null;
        this.inputType = InputTypeDetector.TYPES.UNKNOWN;
        this.nnMouse = new AdaptivePerceptron(InputTypeDetector.TYPES.MOUSE);
        this.nnTouch = new AdaptivePerceptron(InputTypeDetector.TYPES.TOUCH);
        this.nn = this.nnMouse;
        
        // Event listeners
        this.listeners = {};

        this.init();
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
        return this;
    }

    off(event, callback) {
        if (!this.listeners[event]) return this;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        return this;
    }

    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => cb(data));
    }

    init() {
        this.area.addEventListener('mouseenter', (e) => {
            this.lastInputSource = 'mouse';
            this.handleEntry(e);
        }, { passive: true });

        this.area.addEventListener('touchstart', (e) => {
            this.lastInputSource = 'touch';
            this.handleEntry(e.touches[0]);
            this.handleStart(e.touches[0]);
        }, { passive: false });

        this.area.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') {
                if (!this.lastInputSource) this.lastInputSource = 'touch';
            } else if (e.pointerType === 'mouse') {
                if (!this.lastInputSource) this.lastInputSource = 'mouse';
                this.handleStart(e);
            }
        }, { passive: false });

        this.area.addEventListener('mousedown', (e) => {
            if (!this.lastInputSource) this.lastInputSource = 'mouse';
            this.handleStart(e);
        }, { passive: false });

        window.addEventListener('mousemove', (e) => {
            if (this.isTracking && this.lastInputSource === 'mouse') {
                this.handleMove(e);
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (this.isTracking && this.lastInputSource === 'touch') {
                e.preventDefault();
                this.handleMove(e.touches[0]);
            }
        }, { passive: false });

        window.addEventListener('pointermove', (e) => {
            if (this.isTracking) {
                if (e.pointerType === 'touch' && this.lastInputSource === 'touch') {
                    this.handleMove(e);
                } else if (e.pointerType === 'mouse' && this.lastInputSource === 'mouse') {
                    this.handleMove(e);
                }
            }
        }, { passive: false });

        window.addEventListener('mouseup', (e) => {
            if (this.isTracking && this.lastInputSource === 'mouse') {
                this.handleEnd(e);
            }
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
            if (this.isTracking && this.lastInputSource === 'touch') {
                this.handleEnd(e);
            }
        }, { passive: false });

        window.addEventListener('pointerup', (e) => {
            if (this.isTracking) {
                this.handleEnd(e);
            }
        }, { passive: true });

        window.addEventListener('touchcancel', (e) => {
            if (this.isTracking) {
                this.handleEnd(e);
            }
        }, { passive: true });
    }

    handleEntry(e) {
        this.t_entry = performance.now();
        this.entry_pos = { x: e.clientX, y: e.clientY };
    }

    handleStart(e) {
        this.t_down = performance.now();
        this.isTracking = true;
        this.points = [];
        this.addPoint(e);
    }

    handleMove(e) {
        if (!this.isTracking) return;
        this.addPoint(e);
    }

    addPoint(e) {
        this.points.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    }

    handleEnd(e) {
        if (!this.isTracking) return;
        this.isTracking = false;
        this.finalize();
    }

    finalize() {
        this.inputType = InputTypeDetector.detect(this.points, this.lastInputSource);
        
        if (this.inputType === InputTypeDetector.TYPES.TOUCH) {
            this.nn = this.nnTouch;
        } else {
            this.nn = this.nnMouse;
        }

        const t_up = performance.now();
        const dwellTime = t_up - this.t_down;
        const decisionTime = Math.max(this.t_down - this.t_entry, 100);
        const movementTime = t_up - this.t_entry;
        
        this.t_entry = 0;
        
        const targetRect = this.check.getBoundingClientRect();
        const entryPoint = this.entry_pos;
        const targetCenter = { 
            x: targetRect.left + targetRect.width/2, 
            y: targetRect.top + targetRect.height/2 
        };
        
        const D = Math.hypot(targetCenter.x - entryPoint.x, targetCenter.y - entryPoint.y);
        const W = Math.min(targetRect.width, targetRect.height);
        const ID = Math.max(0, Math.log2((2 * D) / (W + 1) + 1));
        
        const throughputExpected = this.inputType === InputTypeDetector.TYPES.TOUCH ? 2.5 : 4.0;
        const timeExpectedFitts = (ID / throughputExpected) * 1000;
        const fittsViolation = this.inputType === InputTypeDetector.TYPES.TOUCH ? 
            movementTime < timeExpectedFitts * 0.35 :
            movementTime < timeExpectedFitts * 0.6;
        
        const jitter = this.analyzeJitter(this.points);
        const speedStats = this.analyzeSpeed(this.points);
        const accelStats = this.analyzeAcceleration(this.points);
        const curvature = this.analyzeCurvature(this.points);
        const entropy = this.analyzeEntropy(this.points);
        const pauses = this.countPauses(this.points);
        const temporalAnalysis = this.checkTemporalPrecision(this.points);

        const temporalViolation = this.inputType === InputTypeDetector.TYPES.TOUCH ?
            temporalAnalysis.isSuspicious && temporalAnalysis.perfectSync > 0.85 :
            temporalAnalysis.isSuspicious;

        const inputs = {
            fitts: fittsViolation ? 1 : 0,
            temporal: temporalViolation ? 1 : 0,
            decision: decisionTime < (this.inputType === InputTypeDetector.TYPES.TOUCH ? 220 : 150) ? 1 : 0,
            jitter: jitter.isWhiteNoise ? 1 : 0,
            dwell: (dwellTime < (this.inputType === InputTypeDetector.TYPES.TOUCH ? 100 : 40) || 
                     dwellTime > (this.inputType === InputTypeDetector.TYPES.TOUCH ? 1500 : 1000)) ? 1 : 0,
            speed: 1 - speedStats.score,
            accel: 1 - accelStats.score,
            curvature: 1 - curvature.score,
            entropy: Math.abs(entropy.normalizedEntropy - 0.6),
            pauses: 1 - pauses.score
        };

        const probability = this.nn.predict(inputs);
        const threshold = this.inputType === InputTypeDetector.TYPES.TOUCH ? 
            this.options.thresholdTouch : 
            this.options.thresholdMouse;
        const verdict = probability > threshold ? 0 : 1; // 0=bot, 1=human

        const result = {
            probability: Math.round(probability * 10000) / 10000,
            verdict: verdict, // 0: bot, 1: human
            inputType: this.inputType,
            thresholdUsed: threshold,
            analysisDetails: {
                dwell: dwellTime,
                reaction: decisionTime,
                fitts: ID,
                temporal: temporalAnalysis.perfectSync,
                jitter: jitter.cv,
                speed: speedStats.score,
                accel: accelStats.score,
                curvature: curvature.score,
                entropy: entropy.normalizedEntropy,
                pauses: pauses.score
            }
        };

        this.emit('result', result);
        return result;
    }

    analyzeJitter(pts) {
        if (pts.length < 5) return { jerk: 0, isWhiteNoise: false, tremor: 0, spectralPower: 0, cv: 0.2, syncRatio: 0 };
        let dts = [];
        for (let i = 1; i < pts.length; i++) dts.push(Math.max(8, pts[i].t - pts[i-1].t)); // ms
        const meanDt = dts.reduce((a,b)=>a+b)/dts.length;
        const varianceDt = dts.reduce((a,b) => a + Math.pow(b - meanDt, 2), 0) / dts.length;
        const stdDevDt = Math.sqrt(varianceDt);

        let velocities = [], accelerations = [];
        for (let i = 1; i < pts.length; i++) {
            const dx = pts[i].x - pts[i-1].x;
            const dy = pts[i].y - pts[i-1].y;
            const dtSec = Math.max(0.008, dts[i-1] / 1000);
            velocities.push(Math.sqrt(dx*dx + dy*dy) / dtSec); // px/s
        }
        for (let i = 1; i < velocities.length; i++) {
            accelerations.push(Math.abs(velocities[i] - velocities[i-1]) / Math.max(0.008, dts[i] / 1000)); // px/s^2
        }

        const meanVel = Math.max(0.1, velocities.reduce((a,b)=>a+b,0)/Math.max(1, velocities.length));
        const varVel = velocities.reduce((a,b) => a + Math.pow(b - meanVel, 2), 0) / Math.max(1, velocities.length) || 0;
        const stdDevVel = Math.sqrt(Math.max(0, varVel));
        const cv = Math.max(0, stdDevVel / Math.max(0.001, meanVel));

        let tremor = 0;
        for (let i = 2; i < accelerations.length; i++) {
            tremor += Math.abs(accelerations[i] - accelerations[i-1]);
        }
        tremor = tremor / Math.max(1, accelerations.length - 2);

        const perfectMultiples = dts.filter(dt => 
            Math.abs(dt - 16.67) < 1 || Math.abs(dt - 33.33) < 1 || Math.abs(dt - 50) < 1
        ).length;
        const syncRatio = dts.length > 0 ? perfectMultiples / dts.length : 0;
        
        const jitterThreshold = this.inputType === InputTypeDetector.TYPES.TOUCH ? 0.12 : 0.08;
        const isSuspiciouslySmooth = cv < jitterThreshold || (varVel < 0.01 && stdDevDt < 1) || syncRatio > 0.75;

        return { jerk: Math.min(1, Math.max(0, tremor / 50)), isWhiteNoise: isSuspiciouslySmooth, tremor: Math.min(1, cv), cv, syncRatio };
    }

    analyzeSpeed(pts) {
        if (pts.length < 3) return { avg:0, max:0, score:0, distribution:'uniform', mode:0, skewness:0 };

        let speeds = [];
        for (let i=1;i<pts.length;i++){
            const dx = pts[i].x - pts[i-1].x;
            const dy = pts[i].y - pts[i-1].y;
            const dtMs = Math.max(8, pts[i].t - pts[i-1].t);
            const dt = dtMs / 1000;
            speeds.push(Math.sqrt(dx*dx+dy*dy)/dt);
        }
        const avg = speeds.reduce((a,b)=>a+b,0)/speeds.length;
        const max = Math.max(...speeds);
        const min = Math.min(...speeds);
        const variance = speeds.reduce((a,b)=>a+Math.pow(b-avg,2),0)/speeds.length;
        const stdDev = Math.sqrt(variance);
        const skewness = stdDev > 0 ? speeds.reduce((a,b)=>a+Math.pow((b-avg)/stdDev,3),0)/(speeds.length) : 0;
        const humanLikeDistribution = skewness > 0.3 && avg > 50 && stdDev / avg > 0.2 && stdDev / avg < 2.0;
        const accelerationPattern = max / Math.max(avg,1) > 1.5 && max / Math.max(avg,1) < 4;
        const score = humanLikeDistribution && accelerationPattern ? 
            Math.min(1, 0.7 + 0.3 * Math.max(0, Math.min(1, (skewness - 0.3) / 1.0))) : 
            Math.max(0, Math.min(1, avg / 600));
        return { avg, max, min, score, distribution: humanLikeDistribution ? 'lognormal' : 'uniform', mode: avg, skewness };
    }

    analyzeAcceleration(pts) {
        if (pts.length < 4) return { avg:0, var:0, score:0, maxAccel:0, naturalAccel:false };

        const speeds = [];
        let dts = [];
        for (let i=1;i<pts.length;i++){
            const dx = pts[i].x - pts[i-1].x;
            const dy = pts[i].y - pts[i-1].y;
            const dtMs = Math.max(8, pts[i].t - pts[i-1].t);
            const dt = dtMs / 1000;
            dts.push(dt);
            speeds.push(Math.sqrt(dx*dx+dy*dy)/dt);
        }
        const acc = [];
        for (let i=1;i<speeds.length;i++) {
            const dv = speeds[i] - speeds[i-1];
            const dt = dts[i] || 0.016;
            acc.push(dv / dt); // px/s^2
        }
        const mean = acc.reduce((a,b)=>a+Math.abs(b),0)/Math.max(1,acc.length);
        const variance = acc.length ? acc.reduce((a,b)=>a+Math.pow(b-mean,2),0)/acc.length : 0;
        const stdDev = Math.sqrt(variance);
        const maxAccel = acc.length ? Math.max(...acc.map(a => Math.abs(a))) : 0;

        const maxAccelThreshold = this.inputType === InputTypeDetector.TYPES.TOUCH ? 6000 : 5000;
        const naturalAccel = maxAccel < maxAccelThreshold && maxAccel > 50;
        const smoothAccel = stdDev / (mean + 0.1) < 3.0;

        const score = (naturalAccel && smoothAccel) ? 
            Math.min(1, 0.8 + 0.2 * Math.max(0, Math.min(1, (stdDev / (mean + 0.1) - 0.5) / 2.0))) :
            Math.max(0, Math.min(1, mean / 2000));
        return { avg: mean, var: variance, score, maxAccel, naturalAccel: naturalAccel && smoothAccel };
    }

    analyzeCurvature(pts) {
        if (pts.length < 4) return { score:0, curvature:0, straightness:0, angleVariance:0 };
        let angleSum = 0, count = 0, angles = [];
        for (let i=2;i<pts.length;i++){
            const a = {x: pts[i-2].x, y: pts[i-2].y};
            const b = {x: pts[i-1].x, y: pts[i-1].y};
            const c = {x: pts[i].x, y: pts[i].y};
            const v1 = {x: b.x - a.x, y: b.y - a.y};
            const v2 = {x: c.x - b.x, y: c.y - b.y};
            const dot = v1.x*v2.x + v1.y*v2.y;
            const mag1 = Math.hypot(v1.x,v1.y); 
            const mag2 = Math.hypot(v2.x,v2.y);
            if (mag1*mag2===0) continue;
            let ang = Math.acos(Math.max(-1, Math.min(1, dot/(mag1*mag2))));
            angles.push(ang);
            angleSum += ang;
            count++;
        }
        const avgAngle = count ? angleSum/count : 0;
        const angleVariance = count ? angles.reduce((a,b)=>a+Math.pow(b-avgAngle,2),0)/count : 0;
        const angleStdDev = Math.sqrt(angleVariance);
        const naturalCurvature = avgAngle > 0.2 && avgAngle < 1.2;
        const smoothCurvature = angleStdDev < avgAngle + 0.5;
        let pathLength = 0;
        for (let i=1;i<pts.length;i++){
            pathLength += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        }
        const euclidean = Math.hypot(pts[pts.length-1].x - pts[0].x, pts[pts.length-1].y - pts[0].y);
        const straightness = euclidean > 0 ? euclidean / pathLength : 0;
        const score = (naturalCurvature && smoothCurvature && straightness > 0.7) ?
            Math.min(1, 0.7 + 0.3 * Math.min(1, straightness)) :
            Math.max(0, Math.min(1, straightness * 0.5));
        return { score, curvature: avgAngle, straightness, angleVariance, naturalCurvature: naturalCurvature && smoothCurvature };
    }

    analyzeEntropy(pts) {
        if (pts.length < 4) return { score:0, entropy:0, directionBias:0, predictability:0 };
        const directions = [];
        for (let i=1;i<pts.length;i++){
            const dx = pts[i].x - pts[i-1].x;
            const dy = pts[i].y - pts[i-1].y;
            if (Math.hypot(dx,dy) < 0.5) continue;
            const ang8 = Math.round(Math.atan2(dy,dx)/ (Math.PI/4)) % 8;
            directions.push(ang8);
        }
        if (directions.length === 0) return { score:0, entropy:0, directionBias:0, predictability:0, normalizedEntropy: 0, dominance: 0 };
        const freq = {};
        directions.forEach(d => freq[d] = (freq[d] || 0) + 1);
        const total = directions.length;
        let entropy = 0;
        Object.values(freq).forEach(c => {
            const p = c / total;
            if (p > 0) entropy -= p * Math.log2(p);
        });
        const maxEntropy = Math.log2(Object.keys(freq).length || 1);
        const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
        const axisAlignedDirs = directions.filter(d => d % 2 === 0).length;
        const directionBias = axisAlignedDirs / total;
        const maxFreq = Math.max(...Object.values(freq));
        const dominance = maxFreq / total;
        const predictability = dominance > 0.6 ? 1 - normalizedEntropy : normalizedEntropy;
        const humanLikeEntropy = normalizedEntropy > 0.4 && normalizedEntropy < 0.95;
        const score = humanLikeEntropy ? 
            normalizedEntropy :
            Math.max(0, Math.min(1, 1 - Math.abs(normalizedEntropy - 0.65) / 0.5));
        return { score, entropy, directionBias, predictability, normalizedEntropy, dominance };
    }

    countPauses(pts) {
        if (pts.length < 3) return { count:0, score:0, meanPause:0, pausePattern:'none' };
        let pauses = [];
        let pauseCount = 0;
        const pauseThreshold = 80;
        for (let i=1;i<pts.length;i++){
            const dt = pts[i].t - pts[i-1].t;
            if (dt > pauseThreshold) {
                pauses.push(dt);
                pauseCount++;
            }
        }
        if (pauseCount === 0) {
            return { count: 0, score: 0.1, meanPause: 0, pausePattern: 'continuous', maxPause: 0 };
        }
        const meanPause = pauses.reduce((a,b)=>a+b,0) / pauses.length;
        const pauseVariance = pauses.reduce((a,b)=>a+Math.pow(b-meanPause,2),0) / pauses.length;
        const pauseStdDev = Math.sqrt(pauseVariance);
        const pauseCV = meanPause > 0 ? pauseStdDev / meanPause : 0;
        const dispersão = pauseVariance / (meanPause + 0.1);
        const poissonLike = dispersão > 0.8 && dispersão < 3.0;
        const naturalPauseTiming = meanPause > 50 && meanPause < 500;
        const score = (poissonLike && naturalPauseTiming && pauseCV > 0.2) ?
            Math.min(1, 0.6 + 0.4 * Math.max(0, Math.min(1, pauseCV / 1.0))) :
            Math.max(0, Math.min(1, Math.min(pauseCount / 5, 1 - dispersão / 5)));
        return { count: pauseCount, score: Math.max(0, Math.min(1, score)), meanPause, pauseStdDev, pauseCV, dispersão, pausePattern: poissonLike ? 'natural_poisson' : (dispersão > 3 ? 'irregular' : 'regular'), maxPause: Math.max(...pauses) };
    }

    checkTemporalPrecision(pts) {
        if (pts.length < 5) return { score:0, isSuspicious:false, perfectSync:0, variance:0 };
        let dts = [];
        for (let i = 1; i < pts.length; i++) {
            dts.push(pts[i].t - pts[i-1].t);
        }
        const refreshRates = [2.78, 4.17, 5, 8.33, 10, 16.67, 20, 33.33, 50];
        const tolerance = 0.5;
        let syncCount = 0;
        dts.forEach(dt => {
            refreshRates.forEach(rate => {
                if (Math.abs(dt - rate) < tolerance || Math.abs(dt - rate*2) < tolerance) {
                    syncCount++;
                }
            });
        });
        const syncRatio = dts.length > 0 ? syncCount / dts.length : 0;
        const meanDt = dts.reduce((a,b)=>a+b)/dts.length;
        const variance = dts.reduce((a,b)=>a+Math.pow(b-meanDt,2),0)/dts.length;
        const cv = Math.sqrt(variance) / meanDt;
        const humanLikeVariance = cv > 0.12;
        const suspiciousSync = syncRatio > 0.65;
        return { score: suspiciousSync ? 0.9 : (humanLikeVariance ? 0.2 : 0.5), isSuspicious: suspiciousSync && !humanLikeVariance, perfectSync: syncRatio, variance: cv, meanDt, meanDtHz: 1000 / meanDt };
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Vhum;
}
