## iPad University View — ระบบ Proxy และ Multi-site Static Hosting

โปรเจคนี้เป็นระบบสำหรับจำลองและทดสอบเว็บไซต์มหาวิทยาลัยหลายโดเมนในเครื่องเดียว รองรับการใช้งานผ่าน iPad หรืออุปกรณ์อื่น ๆ โดยเน้นการใช้งานผ่าน HTTPS และ Proxy เพื่อให้สามารถทดสอบ SSL/HTTPS ได้สมจริง

### โครงสร้างระบบ

- **server.js** — เซิร์ฟเวอร์หลักสำหรับ static file และ reverse proxy
- **certs/** — เก็บไฟล์ certificate (SSL/TLS) ที่สร้างด้วย mkcert
- **burapaphitak/**, **srisilpasart/**, **tcas-simulator/** — โฟลเดอร์เว็บไซต์แต่ละโดเมน (แต่ละโฟลเดอร์มี index.html)
- **proxy-server.js** — (สำรอง) ตัวอย่าง proxy server (ถ้ามี)
- **package.json** — รายการ dependencies (ใช้ http-proxy)
- **.gitignore** — รายการไฟล์ที่ไม่ต้อง track ใน git

### การทำงานโดยสรุป

1. มี static server สำหรับแต่ละโดเมน (เช่น burapaphitak.ac.th, srisilpasart.ac.th, tcas-sim.com) รันแยก port
2. มี proxy server (port 8888) สำหรับ forward traffic ไปยัง static server ตาม hostname
3. รองรับ HTTPS เต็มรูปแบบ (ใช้ mkcert สร้าง certs)
4. สามารถตั้ง proxy ใน iPad เพื่อทดสอบเว็บผ่าน HTTPS ได้

---
ทางลัดสำหรับ Developer: ใช้ mkcert
ถ้าคุณรู้สึกว่า OpenSSL วุ่นวายเกินไป แนะนำให้ใช้เครื่องมือที่ชื่อ mkcert ครับ มันจะจัดการขั้นตอนทั้งหมดข้างบนให้เหลือเพียงคำสั่งเดียว

1. **ติดตั้ง mkcert (Mac):**

	```sh
	brew install mkcert
	```
	<kbd>กดเพื่อคัดลอกไปวางใน Terminal ได้เลย</kbd>

	*(Windows: ดาวน์โหลดจาก GitHub)*

2. **สร้าง Root CA ในเครื่อง:**

	```sh
	mkcert -install
	```
	<kbd>กดเพื่อคัดลอกไปวางใน Terminal ได้เลย</kbd>
	(มันจะสร้าง Root CA ให้คุณอัตโนมัติ)

3. **สร้างใบรับรอง:**

	```sh
	mkcert mysite.test
	```
	<kbd>กดเพื่อคัดลอกไปวางใน Terminal ได้เลย</kbd>

	- คุณจะได้ไฟล์ .pem และ key.pem มาใช้งานได้ทันที

4. **หาตำแหน่งไฟล์ Root CA:**

	```sh
	mkcert -CAROOT
	```
	<kbd>กดเพื่อคัดลอกไปวางใน Terminal ได้เลย</kbd>

	- จากนั้นแค่ส่งไฟล์ Root CA ไปติดตั้งใน iPad ตามขั้นตอนที่ 3 ด้านบนครับ

**สรุป:** เมื่อ iPad เชื่อถือ Root CA ของคุณแล้ว ทุกใบรับรองที่ถูกเซ็นด้วย Root CA นี้ (ไม่ว่าคุณจะสร้างกี่ URL) iPad จะขึ้นกุญแจสีเขียวให้ทั้งหมดครับ
