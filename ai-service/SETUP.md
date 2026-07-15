# AI Service Setup

OCR runs via MinerU, in its own isolated venv separate from the main
service venv (see `app/services/mineru_ocr_service.py` for why: MinerU's
dependency chain collides with this venv's PyTorch if installed together).
Two venvs to set up, not one.

## 1. Main venv (`ai-service/venv`)

```bash
cd ai-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## 2. MinerU venv (`ai-service/mineru_venv`) — must be named/located exactly this way

`mineru_ocr_service.py` hardcodes this path as a sibling of `venv`. Don't
rename or relocate it.

```bash
cd ai-service
python -m venv mineru_venv
```

**If you have an NVIDIA GPU** (recommended — CPU inference works but is
roughly 20x slower per page, observed ~18-22s/page on GPU vs minutes/page
on CPU):

```bash
mineru_venv\Scripts\pip install paddlepaddle-gpu==3.2.1 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/
mineru_venv\Scripts\pip install "nvidia-cudnn-cu12>=9.9.0,<10" --upgrade
mineru_venv\Scripts\pip install -U "mineru[core,pipeline]"
```

The cuDNN upgrade is required, not optional — `pip install paddlepaddle-gpu`
alone pulls `nvidia-cudnn-cu12==9.5.1.17`, which is older than what paddle
actually expects at runtime and raises `OSError: [WinError 127] The specified procedure could not be found` otherwise.

**If you don't have an NVIDIA GPU**, install the CPU build instead — same
`mineru[core,pipeline]` package, no code changes needed (the backend stays
`pipeline` either way; paddle picks CPU/GPU automatically based on what's
installed):

```bash
mineru_venv\Scripts\pip install paddlepaddle==3.2.1 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
mineru_venv\Scripts\pip install -U "mineru[core,pipeline]"
```

### Verify

```bash
mineru_venv\Scripts\python.exe -c "import paddle; print('cuda:', paddle.device.is_compiled_with_cuda())"
```

## 3. Environment variables

Copy the repo-root `.env.example` to `.env` (repo root, not inside
`ai-service/`) and fill in real Supabase DB credentials — `python-dotenv`
walks up from `ai-service/`'s working directory to find it. Get the actual
credentials from whoever owns the Supabase project; don't expect them in
git.

## 4. Run it

```bash
cd ai-service
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

(`mineru_venv` itself never needs activating or starting separately — the
main service shells out to it as a subprocess per paper.)
