# Third-party notices / 제3자 구성요소 고지

이 저장소의 코드는 MIT License(`LICENSE`, Copyright (c) 2026 JJ)를 따릅니다.
아래 구성요소는 각자의 라이선스를 따르며, 이 저장소에 함께 들어 있거나(번들·글꼴) 선택 도구가 씁니다.

## 1. kordoc 브라우저 번들 — `vendor/kordoc/kordoc.browser.js`

한글(hwp·hwpx)·PDF·엑셀 문서를 브라우저 안에서 읽는 데 씁니다. kordoc 4.2.0 을 esbuild 로 묶었습니다
(판·해시: `vendor/kordoc/VERSION`, 묶는 법: `tools/kordoc-bundle/`). 묶음에 든 라이브러리와 라이선스:

| 구성요소 | 판 | 라이선스 | 저작권 |
|---|---|---|---|
| kordoc | 4.2.0 | MIT | Copyright (c) 2026 chrisryugj — https://github.com/chrisryugj/kordoc |
| pdf.js (pdfjs-dist) | 4.10.38 | Apache-2.0 | Mozilla Foundation and contributors |
| cfb | 1.2.2 | Apache-2.0 | SheetJS LLC |
| jszip | 3.10.1 | MIT (MIT/GPL-3.0 이중 라이선스 중 MIT 선택) | Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso |
| @xmldom/xmldom | 0.9.10 | MIT | Copyright 2019 - present Christopher J. Brody and other contributors; Copyright 2012 - 2017 @jindw and other contributors |
| pako | 1.0.11 | MIT | Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn |
| buffer (+ base64-js, ieee754) | 6.0.3 | MIT (ieee754: BSD-3-Clause) | Copyright (c) Feross Aboukhadijeh, and other contributors |
| markdown-it | 14.3.0 | MIT | Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin |
| entities | 4.5.0 | BSD-2-Clause | Copyright (c) Felix Böhm |
| core-js (pdf.js 가 씀) | 3.39.0 | MIT | © 2014-2024 Denis Pushkarev |

요약 표는 `vendor/kordoc/LICENSES.md` 에도 있습니다. Apache-2.0 전문은 https://www.apache.org/licenses/LICENSE-2.0 ,
BSD-2-Clause·BSD-3-Clause 전문은 https://opensource.org/licenses 에 있습니다.

### kordoc — MIT License

```
MIT License

Copyright (c) 2026 chrisryugj

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. 글꼴 Geist · Geist Mono — `site/fonts/`

- `Geist-Variable.woff2`, `GeistMono-Variable.woff2` — Copyright (c) 2023 Vercel, in collaboration with basement.studio
- 라이선스: SIL Open Font License, Version 1.1 — 전문 `site/fonts/OFL.txt`
- 굽는 때 라틴·숫자·기호 부분만 CSS 에 base64 로 넣습니다(`dcc/site_build.py`). 글꼴 자체를 따로 팔지 않는 한 OFL 이 허용하는 쓰임입니다.

## 3. 선택 도구가 쓰는 외부 패키지(저장소에 들어 있지 않음)

| 패키지 | 쓰는 곳 | 라이선스 |
|---|---|---|
| imageio-ffmpeg (Python) | `tools/video/make_video.py`, `tools/motion/make_motion.py` — 영상 굽기 | BSD-2-Clause. 이 패키지가 내려받는 ffmpeg 실행 파일은 LGPL/GPL 을 따릅니다 |
| Pillow (Python, 있으면) | `tools/motion/make_motion.py --contact` — 대조표 그림 | MIT-CMU (HPND) |
| esbuild · buffer · pako · cfb (npm, 개발용) | `tools/kordoc-bundle/` — kordoc 번들 다시 묶기 | MIT / Apache-2.0 |
| wrangler (npm, 선택) | `deploy/` — 공개 주소로 올릴 때만 | MIT OR Apache-2.0 |

영상·번들 도구를 쓰지 않으면 이 패키지들은 필요 없습니다. 화면 두 장을 굽는 데는 파이썬 표준 라이브러리만 씁니다.
