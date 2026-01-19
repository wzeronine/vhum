/***vhum.v2-verificador.de.humanos-icaro.wzeronine***/
class HumanVerifier {
    constructor(checkboxElement, displayElement, moveSampleRate = 5) { 
        this.checkboxElement = checkboxElement;
        this.displayElement = displayElement;
        this.isTracking = false;
        this.dataObject = {};
        this.moveEvents = [];
        this.touchEndBlock = 0;
        this.BLOCK_DURATION = 300;
        this.moveSampleRate = moveSampleRate; 
        this.moveCounter = 0;
        this.attachListeners();
        this.setupInitialState();
    }
    setupInitialState() {
        this.deviceInfo = {
            userAgent: navigator.userAgent,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            pixelRatio: window.devicePixelRatio || 1,
            touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        };
    }
    getTouchData(e) {
        if (!e.changedTouches || e.changedTouches.length === 0) return null; 
        const { clientX: x, clientY: y, force: pressure, target } = e.changedTouches[0];
        return {
            x: Math.round(x),
            y: Math.round(y),
            timestamp: Date.now(),
            pressure: pressure || null,
            target: target.id || target.tagName,
        };
    }
    getMouseData(e) {
        const { clientX: x, clientY: y, target } = e;
        return {
            x: Math.round(x),
            y: Math.round(y),
            timestamp: Date.now(),
            target: target.id || target.tagName,
        };
    }
    handleTouchStart = (e) => {
        if (this.isTracking) return; 
        this.touchEndBlock = 0; 
        this.isTracking = true;
        const startTime = Date.now();
        this.moveEvents = [];
        this.moveCounter = 0;
        this.dataObject = {
            type: "TOUCH",
            startTimestamp: startTime,
            endTimestamp: null,
            touchStart: this.getTouchData(e),
            touchEnd: null,
            moveEvents: this.moveEvents,
            deviceInfo: this.deviceInfo
        };
    }
    handleTouchMove = (e) => {
        if (!this.isTracking || this.dataObject.type !== "TOUCH") return;
        this.moveCounter++;
        if (this.moveCounter % this.moveSampleRate !== 0) return;
        const data = this.getTouchData(e);
        data && this.moveEvents.push(data);
    }
    handleTouchEnd = (e) => {
        if (!this.isTracking || this.dataObject.type !== "TOUCH") return;
        this.isTracking = false;
        this.touchEndBlock = Date.now() + this.BLOCK_DURATION;
        this.dataObject.endTimestamp = Date.now();
        let touchEndData = this.getTouchData(e);
        if (!touchEndData && this.dataObject.touchStart) {
             touchEndData = { 
                ...this.dataObject.touchStart,
                timestamp: this.dataObject.endTimestamp 
             };
        }
        this.dataObject.touchEnd = touchEndData;
        this.dataObject.duration = this.dataObject.endTimestamp - this.dataObject.startTimestamp;
        this.dataObject.metrics = {
             totalMoveEvents: this.moveCounter,
             sampledMoveEvents: this.moveEvents.length
        };
        this.sendDataToServer(this.dataObject);
        this.resetState();
    }
    handleMouseDown = (e) => {
        if (Date.now() < this.touchEndBlock) {
             e.preventDefault(); 
             return; 
        }
        if (e.button !== 0 || this.isTracking) return;
        this.isTracking = true;
        const startTime = Date.now();
        this.moveEvents = [];
        this.moveCounter = 0;
        this.dataObject = {
            type: "MOUSE",
            startTimestamp: startTime,
            endTimestamp: null,
            mouseDown: this.getMouseData(e),
            mouseUp: null,
            moveEvents: this.moveEvents,
            initialCheckboxState: this.checkboxElement.checked,
            deviceInfo: this.deviceInfo
        };
    }
    handleMouseMove = (e) => {
        if (!this.isTracking || this.dataObject.type !== "MOUSE") return;
        this.moveCounter++;
        if (this.moveCounter % this.moveSampleRate !== 0) return;
        const eventData = this.getMouseData(e);
        this.moveEvents.push(eventData);
    }
    handleMouseUp = (e) => {  
        if (Date.now() < this.touchEndBlock) return; 
        if (!this.isTracking || this.dataObject.type !== "MOUSE") return;
        this.isTracking = false;
        this.dataObject.endTimestamp = Date.now();
        this.dataObject.mouseUp = this.getMouseData(e);
        this.dataObject.duration = this.dataObject.endTimestamp - this.dataObject.startTimestamp; 
        this.dataObject.finalInteraction = {
            ...this.getMouseData(e), 
            finalCheckboxState: this.checkboxElement.checked
        };  
        this.dataObject.metrics = {
             totalMoveEvents: this.moveCounter,
             sampledMoveEvents: this.moveEvents.length
        };
        this.sendDataToServer(this.dataObject);
        this.resetState();
    }
    resetState() {
        this.dataObject = {};
        this.moveEvents = [];
        this.isTracking = false;
    }
    sendDataToServer(data) {   
        this.displayElement.textContent = JSON.stringify(data, null, 2);
    }
    attachListeners() {
this.checkboxElement.addEventListener("touchstart", this.handleTouchStart, { passive: true });
        this.checkboxElement.addEventListener("touchmove", this.handleTouchMove, { passive: true });
        this.checkboxElement.addEventListener("touchend", this.handleTouchEnd, { passive: true });  
        this.checkboxElement.addEventListener("mousedown", this.handleMouseDown, { passive: true });
        document.addEventListener("mousemove", this.handleMouseMove, { passive: true });
        document.addEventListener("mouseup", this.handleMouseUp, { passive: true });         
        this.checkboxElement.addEventListener("change", () => {
             if (!this.checkboxElement.checked) {
                 this.resetState();
                 this.displayElement.textContent = "";
             }
        });
    }
}