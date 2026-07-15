// AudioWorklet processor for Marqad
// Captures Float32 audio from the mic and posts chunks to the main thread
// for Int16 PCM conversion and WebSocket transmission.
// Runs at the AudioContext's sample rate (16000 Hz).

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(4096);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        this._buffer[this._offset++] = channelData[i];
        if (this._offset >= this._buffer.length) {
          // Post a copy of the full buffer
          this.port.postMessage(this._buffer.slice());
          this._offset = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
