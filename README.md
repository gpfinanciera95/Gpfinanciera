# G&P FINANCIERA — conexión de solicitudes

Esta versión conserva el diseño existente y añade un backend para que las solicitudes del formulario web se guarden en una base SQLite y aparezcan en el panel administrativo.

## Qué está conectado en el código
- Formulario público `public/index.html` → `POST /api/applications`.
- Base de datos persistente `data/gp-financiera.sqlite`.
- Panel `public/admin-prototipo.html` → inicio de sesión y consulta de solicitudes.
- El administrador puede cambiar el estado a Nueva, En revisión, Aprobada o Rechazada.
- Validación de campos, límites de solicitudes, cookies HTTP-only y same-site, cabeceras Helmet y endpoints administrativos protegidos.

## Importante
Esto es un paquete listo para instalar y desplegar, **no está publicado ni conectado a Internet todavía**. No ingreses datos reales hasta que el despliegue, HTTPS, la persistencia del disco/base de datos y el aviso de privacidad estén verificados.

Los módulos de préstamos, pagos, cartera y seguimientos del panel siguen siendo de demostración local. Solo el módulo de solicitudes se conecta al backend en esta entrega. Marcar una solicitud como aprobada no crea ni desembolsa un préstamo.

## Requisitos
- Node.js 20 o posterior.
- Un servidor/hosting que ejecute una aplicación Node y permita conservar un disco persistente para la carpeta `data/`.
- HTTPS en producción.

## Preparar localmente
1. Copia `.env.example` como `.env`.
2. Define `ADMIN_PASSWORD` con una contraseña única de al menos 14 caracteres y `SESSION_SECRET` con un secreto aleatorio de al menos 32 caracteres.
3. En la terminal, dentro de esta carpeta, ejecuta `npm install`.
4. Exporta las variables de entorno del archivo `.env` (o usa una herramienta local que las cargue) y ejecuta `npm start`.
5. Abre `http://localhost:3000` para la página y `http://localhost:3000/admin-prototipo.html` para el panel.

En producción configura las mismas variables como secretos del proveedor de hosting, `NODE_ENV=production`, HTTPS y un disco persistente montado como `DATA_DIR`. No subas `.env` ni compartas la contraseña del panel.

## Prueba de aceptación antes de usar
1. Envía una solicitud de prueba desde la web.
2. Comprueba que aparezca en el panel al iniciar sesión.
3. Cambia su estado y recarga la página para verificar que persiste.
4. Prueba acceso no autenticado a `/api/admin/applications` y confirma que devuelve 401.
5. Comprueba que una solicitud no se duplique al actualizar la página.

## Privacidad y operación
Antes de activar el formulario para el público, la financiera debe aprobar/publicar su aviso de privacidad, definir quién puede consultar los datos, plazos de conservación, copias de seguridad y un procedimiento para atender solicitudes de los titulares. Este formulario solo recoge datos iniciales; no se deben cargar documentos de identidad, tarjetas ni datos bancarios.
