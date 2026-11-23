# plan-schedule
manage schedule for clean clinic

เว็บจัดตารางเวรทำความสะอาดคลินิกรายเดือน ไม่ต้อง build และเก็บข้อมูลในเบราว์เซอร์ ([ADR 0001](docs/adr/0001-static-site-browser-storage.md)) คำศัพท์อยู่ใน [GLOSSARY.md](GLOSSARY.md)

- เปิดบนเครื่อง: `npx serve .` แล้วเปิด URL ที่ได้ (เปิดไฟล์ตรงๆ ด้วย `file://` ไม่ได้ เพราะใช้ ES module)
- เทสต์ตรรกะการจัดเวร: `npm test`
- Deploy: GitHub → Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`
- ไฟล์ export (`clean-plan-*.json`) มีชื่อสมาชิก ห้าม commit เพราะ repo เป็น public
