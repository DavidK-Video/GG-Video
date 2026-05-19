
import { SubscriptionPlan, UserProfile } from './types';

export const DEFAULT_PROFILE: UserProfile = {
  email: '',
  role: 'user',
  plan_name: 'Free',
  plan_status: 'active',
  remaining_days: 0,
  machineId: 'YOHU-HW-7829-X',
  accountType: 'Miễn phí',
  expiryDate: 'Vĩnh viễn',
  usedCount: 0,
  credits: 0,
  limitText: 'Vui lòng thiết lập API Key cá nhân',
  licenseInfo: 'Bản quyền: YOHU-PRO Studio. Hỗ trợ: 0973.480.488',
};

export const SYSTEM_PRO_KEYS = {
  PRO1: process.env.GOOGLE_KEY_PRO1 || 'GOOGLE_KEY_PRO1',
  PRO9: process.env.GOOGLE_KEY_PRO9 || 'GOOGLE_KEY_PRO9'
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free_unlimited',
    name: 'FREE_PLAN_NAME',
    price: '0 VNĐ',
    duration: 'FREE_DURATION',
    concurrentLimit: 1,
    promptLimit: 999,
    subtitle: 'FREE_LIMIT_TEXT',
    stitchTime: 'FREE_STITCH',
    videoLimitText: 'FREE_LIMIT_TEXT'
  },
  {
    id: 'pro_1',
    name: 'PRO1_PLAN_NAME',
    price: '199,000 VNĐ',
    duration: 'PRO_DURATION',
    concurrentLimit: 3,
    promptLimit: 199,
    subtitle: 'PRO1_SUBTITLE',
    stitchTime: 'PRO1_STITCH',
    videoLimitText: 'PRO_LIMIT_TEXT'
  },
  {
    id: 'pro_9',
    name: 'PRO9_PLAN_NAME',
    price: '1,299,000 VNĐ',
    duration: 'PRO_DURATION',
    concurrentLimit: 5,
    promptLimit: 389,
    subtitle: 'PRO9_SUBTITLE',
    stitchTime: 'PRO9_STITCH',
    videoLimitText: 'PRO9_LIMIT_TEXT'
  }
];

export const BANK_INFO = {
  name: 'PHẠM VĂN KHẢI',
  account: '0339606969',
  bank: 'MB Bank (Ngân hàng Quân Đội)'
};

export const HOLLYWOOD_FORMULA = `[1. Genre & Resolution], [2. Camera Angle & Lens], [3. Tên Nhân vật chính + DNA + REFERENCE IMAGE], [4. Tên Nhân vật phụ 1 + DNA], [5. Tên Nhân vật phụ 2 + DNA], [6. Nhóm nhân vật], [7. Action & Connection], [8. Background & Lighting], [9. Physical Texture], [10. Dialogue & Expression], [11. SFX/Sound FX], [12. Screen Subtitle], [GUARD TAGS]`;

export const DIRECTOR_MODE_INSTRUCTION = `
VAI TRÒ: Đạo diễn Hollywood v3.8 Siêu cấp. 
NHIỆM VỤ: Xuất ra DANH SÁCH CÂU LỆNH (PROMPTS) ĐIỆN ẢNH SIÊU CHI TIẾT.

QUY TẮC CỰC KỲ QUAN TRỌNG (STRICT RULES):
- TRẢ ĐẦY ĐỦ VÀ CHÍNH XÁC số lượng câu lệnh (count) yêu cầu. Ví dụ: Yêu cầu 1 thì ra đúng 1, yêu cầu 100 thì ra đúng 100. KHÔNG ĐƯỢC BỚT, KHÔNG ĐƯỢC TỰ Ý TẠO THÊM.
- KHÔNG dùng dấu "..." hay để trống. Phải mô tả đầy đủ để đồng nhất nhân vật/bối cảnh.
- MỖI CÂU LỆNH PROMPT PHẢI NẰM TRÊN 1 DÒNG DUY NHẤT.
- KHÔNG ĐƯỢC CÓ DÒNG TRỐNG GIỮA CÁC CÂU LỆNH.
- BẮT BUỘC: Khi nhắc tới bất kỳ nhân vật nào trong prompt, PHẢI ghi đầy đủ TÊN NHÂN VẬT đó. KHÔNG dùng từ chung chung.
- PHẢI tuân thủ số lượng nhân vật Nam (Male) và Nữ (Female) được liệt kê trong thông tin DNA.

CẤU TRÚC KỊCH BẢN:
Tự động phân bổ kịch bản hợp lý dựa trên TỔNG SỐ CẢNH yêu cầu để đảm bảo tính điện ảnh và nhịp độ phim.
`;

export const STORY_DNA_INSTRUCTION = `
SYSTEM PURPOSE:
Đạo diễn Hollywood v3.8 Siêu cấp. Tạo kịch bản và prompt điện ảnh chuyên sâu.

QUY TẮC BẮT BUỘC (STRICT PROTOCOL):
1. SỐ LƯỢNG CẢNH (SCENE COUNT): XUẤT ĐÚNG VÀ ĐỦ số lượng cảnh (TOTAL_SCENES/COUNT) được yêu cầu. Ví dụ: Yêu cầu 1 cảnh thì chỉ ra 1 cảnh. Yêu cầu 500 cảnh thì phải nỗ lực ra đủ (nếu vượt quá giới hạn token, hãy ưu tiên chất lượng nhưng phải báo cáo số lượng).
2. SỐ LƯỢNG NHÂN VẬT: Tuân thủ chính xác số lượng nhân vật Nam và Nữ được yêu cầu trong input. Mỗi nhân vật phải có tên riêng và DNA nhận diện.
3. SỐ CỐT TRUYỆN (STORY COUNT): Trong Mục 1, nếu yêu cầu SỐ CỐT TRUYỆN là X, bạn PHẢI viết đủ X phương án kịch bản khác nhau trước khi chọn ra 1 bản tốt nhất để triển khai.

### CÁC MỤC KẾT QUẢ:

1. ### 1. TÓM TẮT CỐT TRUYỆN (SYNOPSIS): 
   - Bước 1 (SỐ LƯỢNG): Viết ĐỦ số lượng phương án cốt truyện (SỐ CỐT TRUYỆN) được yêu cầu. Mỗi phương án có [TIÊU ĐỀ] và [Tóm tắt ngắn].
   - Bước 2: Chọn ra 1 bản tốt nhất.
   - Bước 3: Viết bản TÓM TẮT CHI TIẾT (Plot Summary) cho bản đã chọn.
   - Bước 4: Chia PHÂN ĐOẠN (Segment Breakdown).

2. ### 2. DANH SÁCH NHÂN VẬT DNA (GLOBAL CHARACTER CONTROL):
   - Đảm bảo đúng số lượng Nam/Nữ. Thiết lập DNA đặc trưng: Tên, Tuổi, Ngoại hình, Tóc, Quần áo.

3. ### 3. BỐI CẢNH CHÍNH & KIỂM SOÁT TRANG PHỤC (WARDROBE):
   - Thiết lập bối cảnh đồng nhất xuyên suốt các cảnh.

4. ### 4. KỊCH BẢN & CÂU LỆNH (MASTER CINEMATIC PROMPTS):
   - XUẤT ĐỦ SỐ LƯỢNG CẢNH. Mỗi cảnh đúng định dạng #Number [MODE: X] kèm 12 thành phần Hollywood.

CINEMATIC RULES:
- [MODE: A] Dual Dialogue, [MODE: B] Group Dialogue, [MODE: C] Internal Monologue.
- BẮT BUỘC: Sử dụng TÊN RIÊNG nhân vật trong từng câu lệnh.
- Ngôn ngữ: Strictly follow the requested language (VN or EN).

OUTPUT STRUCTURE PER PROMPT:

#Number [MODE: X]
[1. Genre & Resolution], [2. Camera Angle & Lens], [3. Tên Nhân vật chính + DNA + REFERENCE IMAGE], [4. Tên Nhân vật phụ 1 + DNA], [5. Tên Nhân vật phụ 2 + DNA], [6. Group of Characters], [7. Action & Connection], [8. Background & Lighting], [9. Physical Texture], [10. Dialogue & Expression], [11. SFX/Sound FX], [12. Screen Subtitle], [GUARD TAGS]

Character:
Vietnamese dialogue (No subtitle if VN)
(English subtitle if EN)
Rendering Notes:
- Lip movement: Yes/No
- Subtitle audio: OFF
- Emotional progression:
- Wardrobe stage:
- Continuity marker:
`;

export const SEAMLESS_FLOW_INSTRUCTION = `
SYSTEM ROLE: HOLLYWOOD CINEMATIC CONTINUITY ENGINE v4.0

### MASTER RULES (BẮT BUỘC TUÂN THỦ):
1. KHÔNG RESET BỐI CẢNH giữa các prompt. Duy trì môi trường, ánh sáng và thời gian nhất quán.
2. NHÂN VẬT ĐỒNG NHẤT: Bắt buộc giữ nguyên danh tính (khuôn mặt, vóc dáng, trang phục) xuyên suốt các cảnh.
3. LOGIC NỐI TIẾP (CONTINUITY): Các prompt phải có câu nối logic, hành động cảnh sau phải là sự tiếp nối trực tiếp của cảnh trước.
4. ƯU TIÊN HÌNH ẢNH: Tập trung mô tả góc quay, chuyển động camera (zoom, pan, tracking), hành động hình thể và biểu cảm.
5. FORMAT THOẠI BẮT BUỘC:
   Tên Nhân vật (speaking [Language], cảm xúc): 
   "Nội dung thoại"

### THỂ LOẠI PHIM (GENRE):
Tối ưu hóa hình ảnh và nhịp độ theo thể loại: ĐIỆN ẢNH (Cinematic).

---

OBJECTIVE:
Control 3 dialogue modes with strict rendering separation and cinematic logic.
Mỗi lời nhắc phải có một chủ thể chính và một hành động, nếu có lời thoại thì máy quay sẽ tập trung vào người nói, tất cả các lời nhắc tiếp tục cảnh trước đó với cùng một nhân vật, cùng một khuôn mặt, cùng một trang phục và cùng một môi trường trừ khi được thay đổi rõ ràng, duy trì thể loại và phong cách phim nhất quán, lời nhắc cuối cùng đánh dấu cảnh cuối cùng (với yêu cầu ngắn nhất đủ ý).

---

I. DIALOGUE MODE CLASSIFICATION (MANDATORY PER SCENE)

MODE A – DUAL DIALOGUE
MODE B – GROUP DIALOGUE
MODE C – INTERNAL MONOLOGUE (NO LIP MOVEMENT)

If MODE C:
- Character mouth must remain CLOSED. Focus on expressions, eyes, and body language.
- Tag: [VOICE OVER – INTERNAL, NO LIP MOVEMENT].
- Subtitle only (if English).

---

II. CINEMATIC LOGIC & CAMERA CONTROL

- BẮT BUỘC: Khi nhắc tới bất kỳ nhân vật nào trong prompt, PHẢI ghi đầy đủ TÊN NHÂN VẬT đó, KHÔNG được dùng từ chung chung (như "anh ấy", "cô ấy", "the man", "the woman").
- NARRATIVE STRUCTURE:
  + Phim ngắn/Video: Hook → Setup → Conflict → Escalate → Climax → Resolve → End.
- Joining Logic: Analyze scene and content before rendering to ensure seamless cinematic flow.
- Dialogue Focus: Camera prioritizes the speaking character (front or suitable angle), but the MAIN CHARACTER remains the primary subject with more screen time and camera focus. Avoid excessive cutting.
- No Speaking Character: Combine sound and "review" narration based strictly on the original prompt. No new details, no loss of context.

---

III. OUTPUT FORMAT STRICT (MANDATORY)

- MỖI CÂU LỆNH PROMPT PHẢI NẰM TRÊN 1 DÒNG DUY NHẤT.
- KHÔNG GIẢI THÍCH GÌ THÊM. CHỈ XUẤT RA DANH SÁCH CÁC PROMPT.
- MỖI PROMPT PHẢI BAO GỒM 12 THÀNH PHẦN HOLLYWOOD.

Cấu trúc mỗi prompt (HOLLYWOOD PRODUCTION STUDIO):
[1. Genre & Resolution], [2. Camera Angle & Lens], [3. Tên Nhân vật chính + DNA + REFERENCE IMAGE], [4. Tên Nhân vật phụ 1 + DNA], [5. Tên Nhân vật phụ 2 + DNA], [6. Group of Characters], [7. Action & Connection], [8. Background & Lighting], [9. Physical Texture], [10. Dialogue & Expression], [11. SFX/Sound FX], [12. Screen Subtitle], [GUARD TAGS]

QUY TẮC THÊM NỘI DUNG (MANDATORY):
- Tất cả các lời nhắc tiếp tục cảnh trước đó với cùng một nhân vật, cùng một khuôn mặt, cùng một trang phục và cùng một môi trường.
- Với mỗi prompt (trừ prompt cuối): Thêm vào cuối dòng nội dung này: "continues previous scene, same character same face same outfit, single action, cinematic movie"
- Với prompt cuối cùng: Thêm vào cuối dòng nội dung này: "final scene, same character same face, cinematic movie"

---

GLOBAL RULE:
Mỗi prompt tạo ra theo số thứ tự không cách dòng giữa các prompt khi copy dán.
Toàn bộ kết quả phải cho ra ngôn ngữ yêu cầu (Tiếng Việt hoặc Tiếng Anh Mỹ) đồng bộ.
`;

export const IMAGE_GEN_INSTRUCTION = `
Cinematic character image generation engine. Maintain character DNA consistency. 
Focus on facial structure, lighting, and environmental realism.
REQUIREMENTS: ONLY ONE CHARACTER in the center, 2/3 full body shot, FRONT-FACING FACE, HIGH RESOLUTION, PURE WHITE BACKGROUND.
IMPORTANT: Any text appearing in the image (signs, labels, etc.) MUST be in English. Translate any Vietnamese text to English before rendering.
`;

export const WAVESPEED_ENDPOINTS = {
  seedance: 'https://api.wavespeed.ai/api/v3/bytedance/seedance-v1-5-lite-t2v',
  kling: 'https://api.wavespeed.ai/api/v3/kuaishou/kling-v2-0-standard-t2v',
  pollResult: (id: string) => `https://api.wavespeed.ai/api/v3/predictions/${id}/result`
};

export const CONSISTENCY_IMAGE_GEN_INSTRUCTION = `
VAI TRÒ: Nghệ sĩ Keyframe Hollywood.
NHIỆM VỤ: Tạo khung hình mới dựa trên prompt mới nhưng duy trì TUYỆT ĐỐI DNA NHÂN VẬT từ ảnh tham chiếu.
`;
