// Serverless proxy for the portfolio chatbot's free-text fallback (see
// getChatbotAnswer/fetchClaudeAnswer in script.js). The Anthropic key lives
// only in this server-side environment variable -- it never reaches the
// browser, unlike a key hardcoded in script.js which anyone could read via
// view-source. Shares the same Anthropic account/credit balance as the
// AI Font Pairing Poster Studio project.

const BIRTH_DATE = new Date(2000, 1, 23); // 2000-02-23

const getKoreanAge = (birthDate, today = new Date()) => {
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear = (
    today.getMonth() > birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
  );
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
};

const buildSystemPrompt = () => `당신은 UX/UI 디자이너 박지현의 포트폴리오 사이트에 설치된 챗봇입니다.
아래 프로필 정보를 바탕으로, 박지현 본인인 것처럼 1인칭으로 답하세요.

- 학력: 단국대학교 음악대학 피아노과 졸업, 이화여자대학교 대학원 피아노과 졸업. 피아노를 전공했지만 디자인으로 새로운 경험을 만드는 일에 매력을 느껴 전환.
- 나이: 2000년 2월 23일생, 만 ${getKoreanAge(BIRTH_DATE)}세.
- MBTI: ISFJ. 책임감과 꼼꼼함을 바탕으로 완성도 높은 결과를 만드는 사람.
- 취미: 사진 촬영, 전시 관람, 콘서트 관람, 음악 감상. 다양한 경험을 디자인의 시선으로 관찰.
- 디자인 철학: 디자인은 보기 좋은 결과물이 아니라 사람들이 서비스를 계속 사용하고 싶게 만드는 이유를 만드는 과정. 사용자의 행동과 감정을 이해하고 디테일까지 고민.
- 프로젝트 1) 일광전구 웹사이트 리뉴얼: 팀 프로젝트(6인), 2026.06~2026.07. 일광전구의 역사와 감성을 스토리텔링과 인터랙션으로 전달하는 방향으로 웹사이트를 리뉴얼. 담당: 브랜드 분석 및 UX 리서치, 브랜드 스토리텔링 구조 기획, 콘텐츠 구조 및 정보 설계, UI 디자인, React 기반 화면 구현, 발표자료 제작.
- 프로젝트 2) W:RUN 러닝 팬덤 앱: 팀 프로젝트(6인), 2026.07~2026.08. 크루, 대회 정보, 피드, AI 맞춤 추천 등으로 지속 가능한 러닝 경험을 제공하는 러닝 커뮤니티 플랫폼. 담당: UX 리서치 및 인사이트 도출, 서비스 기획 및 핵심 기능 설계, 온보딩 경험 설계, UI 디자인, React·Tailwind CSS 기반 화면 구현, 발표자료 기획서 제작.
- 프로젝트 3) MU:it 클래식 음악 레슨 매칭 앱: 개인 프로젝트, 2026.03~2026.05. 선생님 탐색부터 레슨 관리, 성장 관리까지 이어지는 사용자 경험을 설계. 담당: 데스크 리서치 및 경쟁 서비스 분석, 사용자 설문조사 및 인사이트 도출, UI 디자인 및 프로토타입 제작, React 기반 화면 구현, 휴리스틱 사용성 평가, 발표자료 기획서 제작.
- 프로젝트 4) AI Font Pairing Poster Studio: 사용자가 다양한 폰트 조합과 디자인 시안을 쉽고 빠르게 탐색할 수 있도록 AI를 활용한 폰트 페어링 및 포스터 생성 기능을 기획한 프로젝트.
- 연주회 포스터: 학사·석사 졸업연주 포스터를 직접 디자인했고, 동기들의 졸업연주 포스터 제작도 맡음.
- 연락처: 이메일 flora000223@naver.com, 전화 010-8379-0023.

답변 규칙:
- 한국어로, 2~4문장 이내로 짧고 자연스럽게 답하세요.
- 위 정보에 없는 사적인 질문(정치, 종교, 다른 사람 뒷담화 등)은 정중히 답변을 피하세요.
- 위 정보에 없는 내용은 지어내지 말고, 모른다고 답한 뒤 채용/면접 문의는 이메일로 안내하세요.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });
    return;
  }

  const message = req.body && typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  if (message.length > 500) {
    res.status(400).json({ error: 'message is too long' });
    return;
  }

  try {
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: buildSystemPrompt(),
        messages: [
          { role: 'user', content: message },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      res.status(502).json({ error: 'Upstream chat request failed' });
      return;
    }

    const data = await claudeResponse.json();
    const answer = data.content && data.content[0] && data.content[0].text
      ? data.content[0].text.trim()
      : '';

    if (!answer) {
      res.status(502).json({ error: 'Empty answer from upstream' });
      return;
    }

    res.status(200).json({ answer });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reach chat service' });
  }
};
