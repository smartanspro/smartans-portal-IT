# Portal de Fichas de Inversión — SMARTANS

`index.html` es el portal completo y autocontenido (listado + formularios + vista previa + generador de PDF) para las fichas de inversión de SMARTANS. Unifica los dos modelos de operación en una sola app, con el look and feel del ERP interno (`erp.smartans.pro`).

No necesita instalación ni backend: todo corre en el navegador, incluida la generación del PDF final.

## Qué incluye

- **Listado de fichas** ("Operaciones → Fichas de Inversión"): todas las fichas creadas, con tipo, última modificación y acciones (editar / duplicar / eliminar).
- **Dos modelos de ficha**, cada uno con su propio formulario, cálculo y diseño de PDF:
  - **Canje de tierra por m²**: el inversor financia la compra de un terreno y lo canja con un desarrollador por un % de los m² construidos. Incluye escenarios de rentabilidad (mínimo / base / máximo).
  - **Crédito con garantía**: préstamo privado a tasa fija (TNA escalonada por monto invertido) con inmuebles en garantía vía fideicomiso. Incluye simulador de rendimiento.
- **Vista previa en vivo**: cualquier cambio en el formulario se refleja al instante en la ficha, con el diseño final tal como sale en el PDF.
- **Exportación a PDF** con un solo botón, generado por `html2canvas` + `jsPDF` (cargados desde CDN).

## Cómo usarlo

1. Abrí `index.html` con doble clic (o subilo a GitHub Pages / cualquier hosting estático).
2. En el listado, tocá **"Nueva ficha"** y elegí el modelo (Canje de tierra o Crédito con garantía).
3. Completá los datos en el formulario de la izquierda — la ficha de la derecha se actualiza sola.
4. Tocá **"Descargar PDF"** para exportarla.
5. Volvé al listado con **"← Volver al listado"** en cualquier momento; los cambios se guardan solos.

Para ver los datos ya cargados de ejemplo, abrí una de las fichas semilla (Ugarte 2729 o Edificio Lavalle 796) desde el listado, o tocá **"Cargar ejemplo"** dentro de cada editor.

## Acceso

El portal pide usuario y contraseña antes de mostrar el listado:

- **Usuario:** `smartans`
- **Contraseña:** `smartans`

La sesión se mantiene mientras la pestaña del navegador siga abierta (se puede cerrar con **"Cerrar sesión"** en el sidebar). Importante: esto es un control de acceso simple para uso interno, **no es seguridad real** — al ser un único archivo HTML sin backend, cualquiera que abra el código fuente puede leer el usuario y la contraseña. No lo uses para proteger información sensible; sirve para evitar que alguien entre por error, no para bloquear un acceso deliberado.

## Dónde vive la información

Las fichas se guardan en el `localStorage` del navegador (clave `smartans_portal_fichas_v1`), **no en un servidor**. Esto significa:

- Los datos quedan en esa PC y ese navegador; no se comparten entre dispositivos.
- Si se borra el historial/datos de navegación del sitio, o se abre el archivo desde otra carpeta/URL, las fichas guardadas no van a aparecer.
- Para compartir una ficha con otra persona, la forma confiable es exportarla a PDF y enviar ese archivo — no el estado guardado en el navegador.

## Enviar por WhatsApp con el PDF en Google Drive

El botón **"📱 Enviar por WhatsApp"** sube el PDF a esta carpeta de Drive: https://drive.google.com/drive/folders/1ngNIzPC7Hhu5vTurAJApxeCgcO7IvpkY , la hace pública ("cualquiera con el link puede ver") y arma el mensaje de WhatsApp con ese link, igual que los mensajes que ya mandás a los clientes.

**Mientras no esté configurado**, el botón funciona igual pero con el modo anterior: descarga el PDF localmente y abre WhatsApp con el texto pidiendo que lo adjuntes a mano — no rompe nada, solo no incluye el link.

Para activar la subida automática hacen falta dos cosas, y las dos son necesarias — con una sola no alcanza:

### 1. Alojar el portal en una URL real (no `file://`)

Google no permite el login de Drive en un archivo abierto con doble clic. Subilo a GitHub Pages (ver sección de abajo) u otro hosting estático; después de subirlo a GitHub, activá GitHub Pages en Settings → Pages → Branch `main` → Save. Vas a obtener una URL como `https://<tu-usuario>.github.io/<tu-repo>/`.

### 2. Crear el Client ID de Google Cloud Console

1. Entrá a [console.cloud.google.com](https://console.cloud.google.com) y creá un proyecto (o usá uno existente).
2. Menú → **APIs & Services → Library** → buscá **"Google Drive API"** → **Enable**.
3. Menú → **APIs & Services → OAuth consent screen** → tipo **External** → completá nombre de la app, tu email → guardá (no hace falta publicarla, alcanza con dejarla en modo "Testing" y agregarte a vos mismo como usuario de prueba en esa misma pantalla).
4. Menú → **APIs & Services → Credentials → Create Credentials → OAuth client ID** → tipo **Web application**.
5. En **Authorized JavaScript origins** agregá la URL del paso 1 (ej. `https://<tu-usuario>.github.io`), sin ruta al final.
6. Creá la credencial y copiá el **Client ID** (termina en `.apps.googleusercontent.com`).
7. Abrí `index.html`, buscá la línea `var GOOGLE_CLIENT_ID = 'PEGAR_TU_CLIENT_ID_AQUI...'` y pegá tu Client ID ahí.

La carpeta de Drive de destino ya está configurada (`DRIVE_FOLDER_ID` en el código) — solo asegurate de que la cuenta de Google con la que inicies sesión tenga permiso de **Editor** sobre esa carpeta.

La primera vez que uses el botón con todo configurado, el navegador va a abrir un popup de Google pidiendo autorización — aceptalo una sola vez por sesión.

## Cómo subirlo a GitHub

1. Generá un Personal Access Token en GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens (con permiso de escritura sobre el repo).
2. En una terminal, dentro de esta carpeta:

```
git init
git add index.html README.md
git commit -m "Portal de fichas de inversión SMARTANS"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
git push -u origin main
```

Cuando pida usuario/contraseña, poné tu usuario de GitHub y como contraseña pegá el **token** (no tu contraseña de la cuenta).

## Notas técnicas

- Requiere conexión a internet la primera vez que se abre (carga las tipografías de Google Fonts y las librerías `html2canvas`/`jsPDF` desde CDN); una vez cacheadas por el navegador, vuelve a funcionar aunque se pierda la conexión.
- El logo de SMARTANS embebido está pensado para fondo oscuro; en la ficha de "Crédito con garantía" (fondo claro) se recolorea automáticamente a negro por CSS.
- No hay backend ni base de datos: es un único archivo HTML autocontenido.
