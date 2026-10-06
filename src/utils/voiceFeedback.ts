/**
 * Phát âm thanh phản hồi thông báo khi không nghe rõ câu lệnh micro.
 * Sử dụng file âm thanh WAV chuẩn tiếng Việt đã lưu sẵn trong tool để đảm bảo:
 * - Không mất tín dụng (credit)
 * - Không có độ trễ mạng
 * - 100% người dùng nghe được tiếng Việt chuẩn phòng thu dù hệ điều hành có gói giọng đọc hay không.
 */
export const playSilenceWarning = (outputLanguage: 'EN' | 'VN' = 'VN') => {
  try {
    const audioSrc = outputLanguage === 'VN' ? '/audio/no_speech_vi.wav' : '/audio/no_speech_en.wav';
    const audio = new Audio(audioSrc);
    
    // Đảm bảo âm lượng rõ ràng
    audio.volume = 1.0;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn("Lỗi phát audio tĩnh, chuyển sang SpeechSynthesis dự phòng:", err);
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const msg = outputLanguage === 'VN'
            ? "Tôi không nghe rõ câu lệnh, vui lòng đọc lại."
            : "I did not hear clearly, please speak again.";
          const utterance = new SpeechSynthesisUtterance(msg);
          utterance.lang = outputLanguage === 'VN' ? 'vi-VN' : 'en-US';
          const voices = window.speechSynthesis.getVoices();
          const viVoice = voices.find(v => v.lang.toLowerCase().startsWith('vi') || v.lang.toLowerCase().includes('viet'));
          if (viVoice) {
            utterance.voice = viVoice;
          }
          window.speechSynthesis.speak(utterance);
        }
      });
    }
  } catch (err) {
    console.error("Voice feedback error:", err);
  }
};

/**
 * Xử lý chuỗi văn bản đọc được từ giọng nói micro:
 * Tự động chuyển đổi các câu lệnh giọng nói thành thẻ tương ứng:
 * - "đây là giọng nam", "thêm giọng nam", "giọng nam", "đóng vai giọng nam" -> [Giọng Nam]
 * - "đây là giọng nữ", "thêm giọng nữ", "giọng nữ", "đóng vai giọng nữ" -> [Giọng Nữ]
 */
export const formatVoiceTranscript = (transcript: string): string => {
  if (!transcript || !transcript.trim()) return '';

  let formattedText = transcript;

  // Khớp từ nói sang thẻ [Giọng Nam]
  const malePatterns = [
    /đây là giọng nam/gi,
    /thêm giọng nam/gi,
    /chuyển giọng nam/gi,
    /đóng vai giọng nam/gi,
    /\[?giọng nam\]?/gi
  ];
  for (const pattern of malePatterns) {
    formattedText = formattedText.replace(pattern, ' [Giọng Nam] ');
  }

  // Khớp từ nói sang thẻ [Giọng Nữ]
  const femalePatterns = [
    /đây là giọng nữ/gi,
    /thêm giọng nữ/gi,
    /chuyển giọng nữ/gi,
    /đóng vai giọng nữ/gi,
    /\[?giọng nữ\]?/gi
  ];
  for (const pattern of femalePatterns) {
    formattedText = formattedText.replace(pattern, ' [Giọng Nữ] ');
  }

  return formattedText
    .replace(/\s+/g, ' ')
    .replace(/\[\s*Giọng\s*(Nam|Nữ)\s*\]/gi, (match) => {
      const cleanedTag = match.toUpperCase().includes('NAM') ? '[Giọng Nam]' : '[Giọng Nữ]';
      return ` ${cleanedTag} `;
    })
    .trim();
};
