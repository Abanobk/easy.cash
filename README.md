# Easy Cash — برنامج محاسبة ERP

نظام محاسبة متكامل بالعربية (عملاء، موردين، مخازن، فواتير، حسابات، موظفين، تقارير).

## النشر على TrueNAS (نفس أسلوب easy.shope)

النشر التلقائي عبر **GitHub Actions + Tailscale + SSH + Docker Compose**.

### 1) أسرار GitHub

في المستودع: **Settings → Secrets and variables → Actions**

يمكنك إعادة استخدام نفس أسرار **easy.shope** ما عدا `DEPLOY_PATH`:

| Secret | الوصف |
|--------|--------|
| `TAILSCALE_AUTHKEY` | مفتاح Reusable/Ephemeral من [Tailscale admin](https://login.tailscale.com/admin/settings/keys) |
| `SSH_PRIVATE_KEY` | المفتاح الخاص من `cat ~/.ssh/github_deploy_easyshope` |
| `SSH_USER` | مستخدم SSH على TrueNAS (مثل `root`) |
| `SSH_HOST` | عنوان Tailscale للـ NAS (مثل `100.92.194.111`) |
| `DEPLOY_PATH` | مسار المشروع على السيرفر — مثل `/root/easy-cash` |

اختياري: `SSH_KNOWN_HOSTS` = مخرجات `ssh-keyscan -H <tailscale-ip>`

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
