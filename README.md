docker compose down
docker compose up --build

check lỗi: docker compose logs -f app


Reset, xoa toan bo du lieu: 
  docker-compose down -v   # xoá container + volume
  docker-compose up --build
