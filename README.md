
# Bot WhatsApp Babu Manage
Bot WhatsApp untuk manage nama nama babu komunitas
## Authors

- [@Fortoises](https://www.github.com/Fortoises)

![NodeJS](https://img.shields.io/badge/nodejs-green)
## Features

### Owner
- addakses [nomor] - Untuk menambahkan nomor agar bisa akses command bot selain admin
- listakses - Untuk melihat semua yang mendapatkan akses ( selain admin grub )
- deleteakses [nomor] - Untuk menghapus nomor dari akses command

### Admin
- addbabu [nama komunitas] - Untuk menambahkan babu komunitas
- deletebabu [nama komunitas] - Untuk menghapus nama komunitas dari daftar babu
- addtxt - Untuk menambahkan nama komunitas melalui file .txt
#### - addtxt-risk - Untuk menambahkan nama komunitas tanpa memperdulikan duplikat dan urutan nomor
#### - addtxt-clean - Untuk menambahkan nama komunitas tanpa duplikat dan memperhatikan urutan nomor

### Public
- menu - Untuk melihat seluruh isi command
- searchbabu - Untuk mencari nama babu
- listbabu - Untuk melihat seluruh daftar babu

### Otomatis Backup
Setiap ada perubahan seperti tambah babu/hapus  babu. Akan otomatis terbackup ke bot telegram. Kamu bisa atur di .env

## Installation

### Requirement

- Nodejs versi 20
- Telegram Bot Token dari @BotFather.
- Telegram ID untuk admin (bisa dicek via bot seperti @userinfobot).


```bash
git clone https://github.com/Fortoises/genz-cc.git
cd genz-cc
```
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install curl -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs
```

Dan pastiin versi nodejs nya 20

```bash
node -v
```

Harus muncul v20

### Start bot

```bash
npm i
```

Pertama jalanin index.js untuk pairing nomor

```bash
node index.js -pairing
```

Lalu jika berhasil CTRL+C

Baru jalankan bot

```bash
npm start
```


### Konfigurasi

#### .env
Contoh terdapat pada file env.example

```bash
PREFIX=.
OWNER=6281234567890
TELEGRAM_BOT_TOKEN=isi_token_telegram_disini
TELEGRAM_CHAT_ID=isi_chat_id_disini 
```
- Untuk prefix terserah kalian (opsional)

- Owner isi dengan nomor kalian ( bukan nomor bot )

- Chat ID Telegram tujuan backup (bisa group atau user, contoh: -1001234567890)

- Token bot Telegram untuk backup (dapatkan dari @BotFather)

- Nomor owner bot (tanpa +, pisahkan dengan koma jika lebih dari satu, contoh: 6281234567890)
## License

[LICENSE](https://github.com/Fortoises/genz-cc/blob/main/LICENSE)

