# Tasks: Migrate and Rename to CRF-Editor

**Change ID**: migrate-and-rename-to-crf-editor
**Total Tasks**: 28

---

## 闃舵 1锛氱櫧鍚嶅崟鏂囦欢澶嶅埗

- [x] 1.1 澶嶅埗 `backend/` 鐩綍锛堝惈 `src/`銆乣requirements.txt`銆乣main.py`銆乣app_launcher.py`銆乣build.bat`銆乣crf.spec`锛夛紝璺宠繃 `.venv/`銆乣__pycache__/`銆乣*.db`銆乣build/`銆乣dist/`
- [x] 1.2 澶嶅埗 `frontend/` 鐩綍锛堝惈 `src/`銆乣public/`銆乣index.html`銆乣package.json`銆乣vite.config.js`锛夛紝璺宠繃 `node_modules/`銆乣dist/`
- [x] 1.3 澶嶅埗 `assets/` 鐩綍锛堝婧愮洰褰曚腑瀛樺湪锛?- [x] 1.4 澶嶅埗鏍圭骇鏂囦欢锛歚README.md`銆乣LICENSE`銆乣.gitignore`锛堝婧愮洰褰曚腑瀛樺湪锛?- [x] 1.5 楠岃瘉锛氱洰鏍囦粨搴撲腑涓嶅瓨鍦?`.venv/`銆乣node_modules/`銆乣*.db`銆乣dist/`銆乣build/`銆乣.pytest_cache/` 浠讳綍涓€椤?
---

## 闃舵 2锛氶厤缃慨澶嶏紙鈿狅笍 蹇呴』鍦ㄩ娆″惎鍔ㄥ墠瀹屾垚锛?
- [x] 2.1 鎵撳紑 `backend/src/config.yaml`锛屽皢 `app.title` 鏀逛负 `CRF缂栬緫鍣╜
- [x] 2.2 灏?`backend/src/config.yaml` 涓?`database.path` 浠庣粷瀵硅矾寰勬敼涓虹浉瀵硅矾寰勶紙濡?`../crf_editor.db`锛夛紝纭繚涓嶅啀鍖呭惈 `D:\Documents\Gitee\` 浠讳綍瀛楁
- [x] 2.3 鎵撳紑 `backend/config.yaml`锛圥yInstaller 鎵撳寘鐢級锛屽悓姝ヤ慨鏀?`app.title` 涓?`CRF缂栬緫鍣╜
- [x] 2.4 鍚屾淇敼 `backend/config.yaml` 涓?`database.path` 涓?2.2 淇濇寔涓€鑷?- [x] 2.5 瀵规瘮涓や釜 config.yaml锛岀‘璁ゆ墍鏈夊叧閿瓧娈碉紙`app.*`銆乣database.*`銆乣server.*`锛夊畬鍏ㄤ竴鑷?
---

## 闃舵 3锛氬悗绔▼搴忓悕绉版浛鎹?
- [x] 3.1 `backend/main.py`锛氬皢 `FastAPI(title="CRF鍏冩暟鎹鐞嗙郴缁?)` 鏀逛负 `FastAPI(title="CRF缂栬緫鍣?)`
- [x] 3.2 `backend/app_launcher.py` L84锛氱郴缁熸墭鐩樺悕绉版敼涓?`"CRF缂栬緫鍣?`
- [x] 3.3 `backend/app_launcher.py` L121锛氱獥鍙ｆ爣棰樻敼涓?`"CRF缂栬緫鍣?`
- [x] 3.4 `backend/app_launcher.py` L123锛氶敊璇脊绐楁爣棰樻敼涓?`"CRF缂栬緫鍣?`
- [x] 3.5 `backend/app_launcher.py` L142锛氬叧闂‘璁ゅ璇濇鏍囬鏀逛负 `"CRF缂栬緫鍣?`
- [x] 3.6 `backend/build.bat` L4锛氭墦鍖呰剼鏈爣棰樻敞閲婃洿鏂颁负 `CRF-Editor Build Script`
- [x] 3.7 `backend/build.bat` L24锛氭棫浜у搧鍚嶆竻鐞嗙洰褰曡矾寰勬敼涓?`crf-editor`
- [x] 3.8 `backend/build.bat` L45锛氳緭鍑?exe 鍚嶇О鏀逛负 `CRF-Editor.exe`
- [x] 3.9 `backend/build.bat` L46锛歞ist 鐩爣鐩綍鏀逛负 `crf-editor`
- [x] 3.10 `backend/crf.spec` L99锛歅yInstaller `name` 瀛楁鏀逛负 `"CRF-Editor"`
- [x] 3.11 `backend/crf.spec` L119锛歜undle name 鏀逛负 `"CRF-Editor"`

---

## 闃舵 4锛氬墠绔▼搴忓悕绉版浛鎹?
- [x] 4.1 `frontend/index.html`锛歚<title>CRF绠＄悊绯荤粺</title>` 鏀逛负 `<title>CRF缂栬緫鍣?/title>`锛堟簮鏂囦欢宸叉纭紝鏃犻渶淇敼锛?- [x] 4.2 `frontend/package.json`锛歚"name"` 瀛楁鏀逛负 `"crf-editor"`
- [x] 4.3 `frontend/src/App.vue`锛歨eader/logo 鍖哄煙宸叉纭樉绀?"CRF缂栬緫鍣?锛屾棤闇€淇敼
- [x] 4.4 `frontend/src/views/Login.vue`锛氭枃浠朵笉瀛樺湪锛堥」鐩娇鐢ㄥ崟椤?App.vue 鏋舵瀯锛夛紝璺宠繃
- [x] 4.5 `frontend/src/components/layout/Sidebar.vue`锛氭枃浠朵笉瀛樺湪锛堥」鐩娇鐢ㄥ崟椤?App.vue 鏋舵瀯锛夛紝璺宠繃

---

## 闃舵 5锛氭枃妗ｆ洿鏂?
- [x] 5.1 `README.md`锛氭洿鏂伴」鐩悕绉般€佸厠闅嗙ず渚嬩腑鐨勭洰褰曞悕锛坄crf_management_online` 鈫?`CRF-Editor`锛?- [x] 5.2 `README.md`锛氭洿鏂版暟鎹簱鏂囦欢鍚嶅紩鐢紙`crf_metadata.db` 鈫?`crf_editor.db`锛屽鏈夋彁鍙婏級

---

## 闃舵 6锛氶獙璇?
- [x] 6.1 杩愯 `pip install -r backend/requirements.txt`锛岀‘璁ゆ棤鎶ラ敊
- [x] 6.2 鍚姩鍚庣锛歚cd backend && python main.py`锛堟垨 `uvicorn src.main:app --reload`锛夛紝纭鏃犳姤閿欙紝纭 `crf_editor.db` 鍦ㄩ鏈熺浉瀵硅矾寰勭敓鎴?- [x] 6.3 纭 `backend/src/config.yaml` 涓殑 `database.path` 涓嶆寚鍚戜换浣曟簮浠撳簱缁濆璺緞
- [x] 6.4 杩愯 `cd frontend && npm install`锛岀‘璁ゆ棤鎶ラ敊
- [x] 6.5 杩愯 `npm run dev`锛屾祻瑙堝櫒璁块棶 `http://localhost:5173`锛岀‘璁ょ櫥褰曢〉鏍囬鏄剧ず **"CRF缂栬緫鍣?**
- [x] 6.6 鐧诲綍鍚庢鏌ワ細渚ц竟鏍忔爣棰樸€侀〉闈?title銆丼wagger `/docs` 椤甸潰鏍囬鍧囨樉绀?**"CRF缂栬緫鍣?** 鎴?**"CRF-Editor"**
- [x] 6.7 纭 Word 瀵煎嚭鍔熻兘姝ｅ父锛岃緭鍑烘枃浠跺悕妯″紡 `_CRF.docx` 淇濇寔涓嶅彉

---

## 鍏抽敭绾︽潫鎻愰啋

> 鈿狅笍 **缁濆涓嶈**鏈烘鍦板皢鎵€鏈?"CRF" 瀛楃涓叉浛鎹?鈥?`Draft CRF`銆乣eCRF`銆乣_CRF.docx` 绛変笟鍔℃湳璇繀椤讳繚鎸佸師鏍?> 鈿狅笍 **闃舵 2 蹇呴』鍦ㄩ樁娈?6 涔嬪墠瀹屾垚** 鈥?鍚﹀垯棣栨鍚姩浼氳鍐欐簮浠撳簱鏁版嵁搴?> 鈿狅笍 **鐩爣浠撳簱涓殑 `.git/`銆乣.claude/`銆乣openspec/` 涓嶅緱琚鐩?*
