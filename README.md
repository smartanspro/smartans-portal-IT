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

El botón **"📱 Enviar por WhatsApp"** sube el PDF a Drive, lo hace público ("cualquiera con el link puede ver") y arma el mensaje de WhatsApp con ese link, igual que los mensajes que ya mandás a los clientes.

**Mientras no esté configurado**, el botón funciona igual pero con el modo anterior: descarga el PDF localmente y abre WhatsApp con el texto pidiendo que lo adjuntes a mano — no rompe nada, solo no incluye el link.

La subida usa un **Google Apps Script** desplegado como "Web App" — no OAuth del lado del navegador. Con esto se evitan por completo los problemas típicos de OAuth (popups bloqueados, permisos insuficientes, tener que reautorizar): el script corre siempre con los permisos de Drive de la cuenta que lo desplegó, y acepta la subida de cualquier origen sin que quien usa el portal tenga que loguearse con Google.

### Cómo activarlo (una sola vez)

1. Andá a [script.google.com](https://script.google.com) → **Nuevo proyecto**.
2. Borrá el contenido de `Code.gs` y pegá **todo** el contenido del archivo `Code.gs` que está en esta misma carpeta.
3. Revisá que la constante `FOLDER_ID` sea el ID de tu carpeta de Drive destino (ya viene con el ID de la carpeta "FICHAS", tomalo de la URL: `drive.google.com/drive/folders/`**`ESTE-ID`**).
4. **Implementar → Nueva implementación** → tipo **"Aplicación web"**.
   - **Ejecutar como**: Yo (tu cuenta, la dueña de la carpeta).
   - **Quién tiene acceso**: Cualquier usuario.
5. Al implementar te va a pedir autorizar permisos (acceso a tu Drive) — aceptalos, es tu propio script actuando en tu nombre.
6. Copiá la **URL de la aplicación web** que te da (termina en `/exec`).
7. Abrí `index.html`, buscá la línea `var APPS_SCRIPT_URL = 'PEGAR_TU_URL_DE_APPS_SCRIPT_AQUI';` y pegá esa URL ahí.

Si más adelante modificás `Code.gs`, tenés que crear una **nueva implementación** (o editar la existente desde "Gestionar implementaciones") para que el cambio se aplique — guardar el script solo no alcanza.

No hace falta alojar el portal en ningún dominio especial para que esto funcione — como no hay OAuth del lado del navegador, funciona incluso abriendo `index.html` localmente con doble clic.

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
