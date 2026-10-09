# 녹음을 받아 적는다(단어별 시간 포함) → demo/work/audio/transcript.json
# 실행: python demo/transcribe.py demo/narration.m4a
import json, os, subprocess, sys, numpy as np
from faster_whisper import WhisperModel

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), "work", "audio", "transcript.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
model = WhisperModel("small.en", device="cpu", compute_type="int8")
# 오디오는 ffmpeg로 16kHz 모노로 풀어서 넘긴다(faster-whisper의 PyAV 디코더를 쓰지 않음).
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
segments, info = model.transcribe(audio, language="en", word_timestamps=True, vad_filter=False, beam_size=5)
data = []
for s in segments:
    data.append({"start": s.start, "end": s.end, "text": s.text.strip(),
                 "words": [{"start": w.start, "end": w.end, "word": w.word} for w in (s.words or [])]})
    print(f"{s.start:7.2f}-{s.end:7.2f}  {s.text.strip()}")
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)

