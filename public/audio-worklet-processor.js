// AudioWorklet processor for Marqad
// Captures Float32 audio from the mic and posts chunks to the main thread
// for Int16 PCM conversion and WebSocket transmission.
// Runs at the AudioContext's sample rate (16000 Hz).
//
// Uses a double-buffer strategy with transferable ArrayBuffers to avoid
// GC pressure during long (1-hour) recording sessions. The buffer is
// transferred (not copied) to the main thread, and a new buffer is
// allocated for the next chunk.

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 4096;
    this._buffer = new Float32Array(this._bufferSize);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        this._buffer[this._offset++] = channelData[i];
        if (this._offset >= this._bufferSize) {
          // Transfer the underlying ArrayBuffer to the main thread (zero-copy)
          // Then allocate a fresh buffer for the next chunk
          const out = this._buffer;
          this._buffer = new Float32Array(this._bufferSize);
          this._offset = 0;
          this.port.postMessage(out.buffer, [out.buffer]);
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
