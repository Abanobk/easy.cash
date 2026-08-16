# Easy Cash — برنامج محاسبة ERP

نظام محاسبة متكامل بالعربية (عملاء، موردين، مخازن، فواتير، حسابات، موظفين، تقارير).

## النشر التلقائي (زي FlutterFlow Publish)

أي `git push` على فرع **`main`** يشغّل GitHub Actions وينشر على السيرفر لوحده — من غير ما تشغّل `deploy.sh` يدوياً.

```bash
git add -A && git commit -m "…" && git push origin main
# → راقب: https://github.com/Abanobk/easy.cash/actions
```

تشغيل يدوي من الماك (نفس أسلوب flutter_app2 عبر Cloudflare):

```bash
# سريع — يرفع التعديلات فقط (rsync) ثم يبني على السيرفر
./scripts/deploy.sh
# أو: pnpm deploy:fast

# رفع فقط بدون Docker rebuild
./scripts/deploy.sh --sync-only

# رفع كامل قديم (tar لكل المشروع)
./scripts/deploy.sh --full
```

مرة واحدة لو `rsync` مش موجود: `brew install rsync`

### 1) أسرار GitHub

في المستودع: **Settings → Secrets and variables → Actions**

**المفضّل (Cloudflare Access — نفس نفق `ssh-deploy.easytecheg.net`):**

| Secret | الوصف |
|--------|--------|
| `CF_ACCESS_CLIENT_ID` | Client ID من Access → Service Tokens |
| `CF_ACCESS_CLIENT_SECRET` | Client Secret لنفس الـ token |
| `CF_TUNNEL_HOST` | اختياري — الافتراضي `ssh-deploy.easytecheg.net` |
| `SSH_PRIVATE_KEY` | المفتاح الخاص من `cat ~/.ssh/github_deploy_easyshope` |
| `SSH_USER` | مثل `root` |
| `DEPLOY_PATH` | مثل `/root/easy-cash` |

إنشاء Service Token مرة واحدة من Cloudflare Zero Trust → Access → Service Auth → Create Service Token، واربطه بسياسة Application الخاصة بـ SSH.

**بديل (Tailscale) — لو مفيش CF secrets:**

| Secret | الوصف |
|--------|--------|
| `TAILSCALE_AUTHKEY` | مفتاح **Reusable/Ephemeral** جديد من [Tailscale Keys](https://login.tailscale.com/admin/settings/keys) (المفتاح القديم منتهي → `invalid key`) |
| `SSH_HOST` | عنوان Tailscale للـ NAS |
| `SSH_PRIVATE_KEY` / `SSH_USER` / `DEPLOY_PATH` | كما فوق |

اختياري: `SSH_KNOWN_HOSTS` = مخرجات `ssh-keyscan -H <host>`

### 2) على TrueNAS

- SSH مفعّل (منفذ 22)
- نفس المفتاح العام لـ GitHub مضاف في `authorized_keys`
- مجلد `DEPLOY_PATH` قابل للكتابة
- بعد أول نشر، عدّل `.env` على السيرفر (كلمات مرور MySQL و `JWT_SECRET`)

### 3) التحقق بعد النشر

```bash
cat /root/easy-cash/last_deploy.txt
curl -fsS http://127.0.0.1:8099/api/health
```

المنفذ الافتراضي **8099** (easy.shope يستخدم 8098). اربطه في Cloudflare مثل:

`cash.easytecheg.net` → `http://192.168.x.x:8099`

### 4) نسخ احتياطي MySQL

```bash
cd /root/easy-cash
BACKUP_DIR=/root/easy-cash-backups ./scripts/backup-mysql.sh
```

## التطوير المحلي

```bash
pnpm install
cp .env.example .env
# عدّل DATABASE_URL لقاعدة محلية أو TiDB
pnpm dev
```

## الربط بـ GitHub

```bash
git init
git add .
git commit -m "chore: initial commit with TrueNAS deploy"
git branch -M main
git remote add origin https://github.com/Abanobk/easy.cash.git
git push -u origin main
```

بعد `push` إلى `main` راقب تبويب **Actions** في GitHub.
