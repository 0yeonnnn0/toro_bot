# TORO Home Server Deployment

## 실행

```bash
docker compose build
docker compose up -d
docker compose logs -f --tail=100
```

SQLite DB는 ./data:/app/data 볼륨에 저장된다. 컨테이너 시작 시 Prisma db push 후 앱을 시작한다. ffmpeg와 yt-dlp가 이미지에 포함된다.
