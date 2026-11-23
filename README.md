# 📚 루카 통합사전

국어 · 영어 · 한자를 한 곳에서 찾는 어린이용 통합 사전 웹앱입니다.
광고, 댓글, 다른 사이트로 나가는 링크가 없습니다.

- 주소: https://yuuunjk.github.io/dictionary/
- 만든 사람: 윤진경 (@yuuunjk) · 아들 LUKA와 함께 씁니다.
- 화면: 갤럭시탭 S9 가로(1280×800)와 휴대폰 세로(412×915)에서 확인했습니다.

## 무엇을 할 수 있나요

| 탭 | 내용 |
| --- | --- |
| 전체 | 국어·영어·한자를 한 번에 찾습니다. |
| 국어 | 뜻·품사·예문·비슷한 말/반대말 + 위키낱말사전 실시간 풀이. 한국어 발음 듣기. |
| 영어 | 한국어 뜻을 **품사별로 나누어** 여러 뜻(다의어)과 영영 뜻, 예문을 함께 보여 줍니다. `apple`로도, `사과`로도 찾을 수 있습니다. |
| 한자 | 큰 글자 카드, 훈·음(클 대 / 큰 대), 부수·총획·급수, 이 글자가 들어간 낱말. `大`, `대`, `클 대`, `클` 모두 검색됩니다. |
| ⭐ 내 단어장 | 국어·영어·한자 구분 저장, 카드 복습(뒤집기). |

- **오늘의 추천 낱말**: 날짜를 기준으로 국어·영어·한자에서 하나씩 골라 보여 줍니다.
- **최근 찾은 낱말**: 최대 12개, 기기에만 저장합니다.
- **PWA**: 홈 화면에 설치하면 주소창 없이 열리고, 한 번 열어 두면 인터넷이 없어도 내장 사전과 단어장을 볼 수 있습니다.

## 사전 데이터

| 종류 | 수록량 | 출처 |
| --- | --- | --- |
| 한자 | **1,817자** (한국어문회 배정한자 8급~3급) · 훈·음·부수·총획·급수·낱말 2~4개 | 훈·음·급수·부수: 한국어문회 배정한자 자료([rycont/hanja-grade-dataset](https://github.com/rycont/hanja-grade-dataset)) · 총획: Unicode Unihan · 낱말 예시: 한국어기초사전·우리말샘 한자어(CC BY-SA 2.0 KR) · 부수 이름: 직접 정리 |
| 영어 | **3,522개** 초·중·고 필수 + 일상 기본 어휘 · 품사별로 묶은 여러 한국어 뜻(다의어) + 영영 뜻 + 예문/해석 + 발음기호 | 직접 정리 · 어휘 선정 참고: The Oxford 3000/5000, [New General Service List](https://www.newgeneralservicelist.com/)(CC BY-SA 4.0) · 발음기호는 [ipa-dict](https://github.com/open-dict-data/ipa-dict)(MIT, 미국식) |
| 국어 | **10,597개** — 낱말 10,280(초급·중급) · 속담 240 · 사자성어 77 · 뜻·예문·한자 표기 | 뜻·예문: 국립국어원 [한국어기초사전](https://krdict.korean.go.kr/) (CC BY-SA 2.0 KR) 및 직접 정리 |
| 실시간 | 영어 영영 사전, 국어 위키낱말사전 | [Free Dictionary API](https://dictionaryapi.dev/) · [위키낱말사전](https://ko.wiktionary.org/) (CC BY-SA 4.0) |

한국어기초사전 데이터는 국립국어원이 CC BY-SA 2.0 KR로 배포하는 자료를 가공해 담았습니다.

## 개인정보

- 검색 기록과 단어장은 브라우저 `localStorage`에만 저장됩니다. 서버로 보내지 않습니다.
- 뜻을 찾을 때 **검색한 낱말만** 사전 서비스에 전달됩니다. 아이 이름, 나이, 기기 정보는 보내지 않습니다.
- 광고, 분석 도구, 댓글, 외부 링크가 없습니다.

## 파일 구성

```
index.html            화면
css/style.css         디자인
js/app.js             검색·단어장·복습
js/data-hanja.js      한자 1,817자
js/data-en.js         영어 3,522개
js/data-ko.js         국어 10,597개(낱말·속담·사자성어)
fonts/                Pretendard(본문) · DictHanja(한자, Noto Serif CJK KR 서브셋)
icons/                앱 아이콘 192 · 512 · maskable
manifest.webmanifest  PWA 설정 (start_url "./", display "standalone", scope "./")
sw.js                 오프라인 캐시
screenshots/          확인용 화면 캡처
```

## 직접 열어 보기

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000/ 열기
```

서비스 워커와 사전 API는 `localhost` 또는 `https`에서만 동작합니다.
