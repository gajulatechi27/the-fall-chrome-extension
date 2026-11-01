export class JourneyAudio {
  constructor() {
    this.context=null;this.master=null;this.windGain=null;this.rainGain=null;this.droneGain=null;
    this.enabled=false;this.muted=false;this.started=false;
  }
  async start() {
    if(this.started)return;
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    this.context=new AudioContextClass();
    this.master=this.context.createGain();this.master.gain.value=.22;this.master.connect(this.context.destination);
    this.windGain=this.context.createGain();this.windGain.gain.value=0;this.windGain.connect(this.master);
    this.rainGain=this.context.createGain();this.rainGain.gain.value=0;this.rainGain.connect(this.master);
    this.droneGain=this.context.createGain();this.droneGain.gain.value=.035;this.droneGain.connect(this.master);
    const noiseBuffer=this.context.createBuffer(1,this.context.sampleRate*2,this.context.sampleRate);
    const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const noise=this.context.createBufferSource();noise.buffer=noiseBuffer;noise.loop=true;
    const windFilter=this.context.createBiquadFilter();windFilter.type="lowpass";windFilter.frequency.value=480;
    noise.connect(windFilter);windFilter.connect(this.windGain);noise.start();
    const rain=this.context.createBufferSource();rain.buffer=noiseBuffer;rain.loop=true;
    const rainFilter=this.context.createBiquadFilter();rainFilter.type="highpass";rainFilter.frequency.value=1100;
    rain.connect(rainFilter);rainFilter.connect(this.rainGain);rain.start();
    const osc=this.context.createOscillator();osc.type="sine";osc.frequency.value=55;osc.connect(this.droneGain);osc.start();
    this.started=true;this.enabled=true;
    if(this.context.state==="suspended")await this.context.resume();
  }
  update(speed,rainIntensity) {
    if(!this.started||!this.context)return;
    const t=this.context.currentTime;
    this.windGain.gain.setTargetAtTime(this.muted?0:Math.min(.22,speed/500),t,.35);
    this.rainGain.gain.setTargetAtTime(this.muted?0:rainIntensity*.11,t,.45);
    this.droneGain.gain.setTargetAtTime(this.muted?0:.025,t,1.2);
  }
  thunder(distance=1200) {
    if(!this.started||this.muted)return;
    const delay=Math.max(0,distance/343);
    window.setTimeout(()=>{
      if(!this.context||this.muted)return;
      const t=this.context.currentTime;
      const osc=this.context.createOscillator(),gain=this.context.createGain();
      osc.type="sawtooth";osc.frequency.setValueAtTime(62,t);osc.frequency.exponentialRampToValueAtTime(28,t+1.8);
      gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.18,t+.08);gain.gain.exponentialRampToValueAtTime(.0001,t+3.2);
      osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+3.25);
    },delay*1000);
  }
  toggleMute(){this.muted=!this.muted;if(this.muted&&this.master)this.master.gain.setTargetAtTime(0,this.context.currentTime,.1);else if(this.master)this.master.gain.setTargetAtTime(.22,this.context.currentTime,.1);return this.muted;}
  dispose(){try{this.context?.close();}catch{}this.started=false;}
}