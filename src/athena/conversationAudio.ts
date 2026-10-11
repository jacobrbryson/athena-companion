/** Recognition must consume our processed track, rather than opening another mic.
 * The audioTrack overload is supported by desktop Chromium 135+. Older engines
 * silently ignore its argument, so do not silently fall back to a second input.
 */
export function supportsRecognitionTrack(userAgent: string): boolean {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return false;
  const chromium = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  return !!chromium && Number(chromium[1]) >= 135;
}

export function connectConversationAudio(audio: AudioContext, stream: MediaStream) {
  const source = audio.createMediaStreamSource(stream);
  const analyser = audio.createAnalyser();
  analyser.fftSize = 1024;
  const gain = audio.createGain();
  const output = audio.createMediaStreamDestination();
  // Detection always hears the echo-cancelled mic, including interruptions.
  // Only the recognition branch is silenced when the remaining sound is echo.
  source.connect(analyser);
  source.connect(gain);
  gain.connect(output);
  return {
    analyser,
    track: output.stream.getAudioTracks()[0],
    allowRecognition: (allow: boolean) => { gain.gain.value = allow ? 1 : 0; },
    dispose: () => {
      source.disconnect();
      analyser.disconnect();
      gain.disconnect();
      output.stream.getTracks().forEach((track) => track.stop());
    },
  };
}
