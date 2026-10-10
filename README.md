# Psynapse Connect

IDE web funcional para HTML, CSS y JavaScript. Requiere Node.js 22 o superior; no requiere instalar dependencias.

```sh
npm start
```

Abre http://localhost:3000. Crea una cuenta con correo y contraseña de al menos 10 caracteres. Los proyectos se guardan en `data/store.json` y cada cuenta solo accede a los suyos. Usa Guardar o Ctrl/⌘ + S antes de cerrar. El chat guarda automáticamente el proyecto antes de enviarlo al proveedor.

En **Conectar IA**, sigue el tutorial y guarda la conexión de OpenRouter, Groq o Google AI Studio. Las claves se cifran con AES-256-GCM en el servidor, asociadas al usuario y al proveedor mediante datos autenticados. Se conservan al cerrar sesión y reiniciar, y se recuperan al iniciar sesión en cualquier navegador. La interfaz recibe únicamente estado, plan y últimos cuatro caracteres enmascarados; permite probar, reemplazar y eliminar. Una sustitución inválida conserva la conexión anterior. Las llamadas al proveedor se realizan desde el servidor. El código guardado se comparte con el proveedor al enviar un mensaje, sin incluir las claves.

La clave maestra de 32 bytes se crea fuera del proyecto y de la base de datos: en Windows, `%LOCALAPPDATA%\Psynapse Connect\master.key`; en otros sistemas, `~/.config/Psynapse Connect/master.key`. El archivo queda restringido al usuario del servidor (ACL en Windows, permisos 0600 en otros sistemas). Respáldalo por separado de `data/store.json`: sin él no se pueden recuperar las conexiones. Si falta y existen conexiones cifradas, el servidor se niega a arrancar en lugar de crear otra clave. No lo copies al repositorio. Las conexiones anteriores que estaban solo en memoria requieren guardarse una vez en la nueva versión.

Al cerrar sesión, se elimina la sesión del servidor y se limpian editor, proyectos, conversación, catálogo, vista previa y formularios del navegador. La preferencia Solo gratuitos puede conservarse; nunca contiene secretos. Las claves no se guardan en localStorage ni se incluyen en registros, respuestas del chat o archivos de los proyectos.

## Chat que aplica cambios

Pide crear una página para generar y guardar `index.html`, `style.css` y `script.js` en el proyecto activo. Pide modificaciones para aplicar sustituciones exactas sobre el código actual, conservando los demás archivos y fragmentos. El editor y la vista previa se actualizan automáticamente. Las preguntas explicativas responden en el chat sin escribir archivos. El modelo debe admitir JSON Object Mode; si rechaza el formato, selecciona otro modelo.

El servidor valida JSON, acción, rutas permitidas, archivos duplicados, tamaño, fragmentos exactos únicos y sintaxis de JavaScript sin ejecutarlo. No admite rutas arbitrarias, selección de otros proyectos desde la respuesta ni respuestas truncadas. La validación de sintaxis no garantiza que la página no tenga errores de funcionamiento. Las escrituras y la versión previa se guardan juntas atómicamente. Si otro guardado altera el proyecto durante la respuesta, se rechaza el cambio de IA.

**Deshacer** restaura la versión anterior completa y actualiza editor y vista previa. Conservamos hasta veinte versiones, incluyendo guardados manuales; sobreviven al reinicio. Si hay cambios locales sin guardar, pide confirmación antes de descartarlos. No hay rehacer en esta versión.

## Catálogo de modelos

### Google AI Studio

Se conecta desde Conectar IA y usan las mismas conexiones cifradas por usuario: guardar, probar, reemplazar y eliminar, con persistencia tras logout y reinicio. Se integran en el catálogo, buscador y Plan/Build con versiones anteriores para Deshacer.

Google: entra a [AI Studio](https://aistudio.google.com), inicia sesión con Google y genera una clave en Dashboard → API Keys para tu proyecto; si es necesario, importa el proyecto y revisa sus permisos. Pégala en la app, declara el nivel de facturación real y guarda. El servidor consulta ListModels con paginación y limita el catálogo a modelos que admiten generateContent; utiliza el protocolo nativo Gemini, sin claves en URL ni llamadas desde el navegador. Consulta la tabla oficial de [precios](https://ai.google.dev/gemini-api/docs/pricing?hl=en) para entrada y salida en el nivel gratuito. Solo gratuitos requiere modelo documentado y nivel gratuito declarado; la app no puede verificar la facturación ni la cuota restante de la cuenta. Si falta información, muestra precio no confirmado. Gemini 2.5 Flash y Flash-Lite figuran con nivel gratuito sujeto a cuotas; se muestran únicamente si tu catálogo los devuelve. El contenido del nivel gratuito puede usarse para mejorar productos de Google. [Gestión oficial de claves](https://ai.google.dev/gemini-api/docs/api-key).

El catálogo se obtiene de todos los proveedores conectados. Usa el buscador por nombre, plataforma o proveedor del modelo, el selector de proveedor, el selector de precio y **Solo gratuitos**. Las palabras completas `free` o `gratis` activan la búsqueda exclusivamente gratuita. Al ocultar el modelo seleccionado, se deja la selección vacía: no se cambia automáticamente a otro modelo. Al aplicar código de IA se abre la pestaña del primer archivo modificado y, en celular, se muestra Código.

OpenRouter: se comprueban `pricing.prompt` y `pricing.completion`, y se descartan cargos adicionales positivos. Cero en ambos permite FREE; precios positivos indican DE PAGO; datos incompletos o contradicciones con `:free` indican PRECIO NO CONFIRMADO. El sufijo `:free` se distingue visualmente pero no basta para confirmar un precio cero. Fuente: [API pública de modelos](https://openrouter.ai/api/v1/models).

Groq: su catálogo no informa el plan de la cuenta ni los precios. La lista de modelos de chat con disponibilidad bajo cuotas se verificó el 10 de octubre de 2026 en [Free Plan Limits](https://console.groq.com/docs/rate-limits). Esa verificación caduca tras 24 horas y después la disponibilidad se marca como no confirmada hasta actualizar la lista en el código. En Conectar IA, indica si usas el plan gratuito; es una declaración del usuario, no una verificación de la cuenta. Solo los modelos documentados con verificación vigente y plan gratuito declarado se incluyen en Solo gratuitos; muestran «Disponible en plan gratuito, sujeto a cuotas». No se conoce la cuota restante ni se garantiza que una cuenta de pago ejecute solicitudes gratis. Los demás modelos tienen PRECIO NO CONFIRMADO.

El servidor vuelve a comprobar la gratuidad al enviar con el filtro activo y rechaza modelos de pago o desconocidos. Un error 429 puede activar el respaldo automático con otros modelos conectados, hasta cinco intentos. Con Solo gratuitos se comprueba nuevamente el catálogo y se excluyen opciones de pago o sin gratuidad confirmada. El aviso 402 informa que el proveedor requiere saldo o habilitación. No hay sustitución automática por modelos de pago.

Para probar con una conexión real en un proyecto de prueba: solicita `Crea una página sencilla con el título Jardín Lunar, estilos verdes y un botón que cuente clics`; después `Cambia solamente el título Jardín Lunar por Jardín Solar, conserva todo lo demás`; pulsa **Deshacer** y comprueba que regresa el título inicial. Una prueba con respuestas simuladas no verifica disponibilidad, saldo ni comportamiento del modelo real.

La vista previa usa un iframe sin permiso de mismo origen y una política que bloquea red, formularios y recursos externos. Permite HTML/CSS/JS inline y recursos data/blob. Un bucle infinito en el código puede bloquear la pestaña; esta versión no ofrece un proceso separado por proyecto.

## Configuración

- `PORT`: 3000 por defecto.
- `HOST`: 127.0.0.1 por defecto. Para probar desde celular en una red de confianza, usa 0.0.0.0 y visita la IP del equipo. Las claves requieren HTTPS si el acceso no es exclusivamente local.
- `DATA_DIR`: directorio de persistencia; respalda su contenido.
- `CONNECTION_KEY_FILE`: ruta absoluta opcional a la clave maestra externa; no puede estar dentro del proyecto ni de DATA_DIR. Conserva el mismo archivo tras cada reinicio.
- `COOKIE_SECURE=true`: obligatorio detrás de HTTPS para despliegue.

Servidor de una sola instancia con escritura atómica en JSON, contraseñas scrypt, sesiones HttpOnly de 24 horas, comprobación de origen y límite de intentos de autenticación. Reiniciar conserva cuentas, proyectos y conexiones cifradas e invalida sesiones. Antes de uso público: HTTPS, base de datos transaccional, recuperación y verificación de correo, límites distribuidos y respaldo automático. No hay recuperación de contraseña en esta primera versión.

## Validación

`npm test` comprueba autenticación, persistencia, aislamiento entre usuarios, creación/edición/deshacer con proveedores simulados, validación de respuestas y conflictos de concurrencia. Integración real de IA requiere una clave del usuario; no se incluyen claves reales de prueba.

PWA, Android y cobros se reservan para etapas posteriores.

## Consumo y contexto

El chat muestra tokens por petición y acumulados en la conversación y proyecto. El consumo se guarda por usuario/proyecto en el servidor, sin prompts ni claves, incluyendo Plan/Build, reintentos y respuestas con uso reportado que no superan la validación. Limpiar el chat inicia una conversación nueva, sin borrar el consumo del proyecto. El historial del chat sigue siendo temporal; el consumo registrado sobrevive al reinicio.

OpenRouter usa usage.prompt_tokens, completion_tokens y cost; Groq usa usage y cabeceras oficiales de cuota; Gemini usa usageMetadata, incluyendo pensamientos en salida. A falta de conteo, se usa una aproximación por caracteres marcada Estimado. El costo reportado tiene prioridad; si falta, se calculan precios verificados cuando existen. En Google se calculan únicamente tarifas simples sin rangos o modalidades ambiguas; en Groq, si el catálogo no informa precios, queda Costo no disponible salvo gratuidad confirmada. Los importes están en USD y no representan una factura completa.

El contexto del próximo envío se estima usando las instrucciones reales, historial seleccionado y archivos actuales, con cero herramientas en esta versión. La reserva de respuesta coincide con el máximo enviado (hasta 8192 tokens, limitado por el catálogo). OpenRouter usa context_length, Groq context_window cuando existe. Google publica entrada y salida por separado: la barra de entrada no descuenta dos veces la reserva de salida. Cuando el catálogo no informa límite, se indica. Cuotas y reinicio aparecen únicamente si llegan en cabeceras de respuesta; son una captura fechada, no una predicción del saldo diario.

## Descargar proyecto

Descargar proyecto guarda primero los cambios pendientes y descarga un ZIP con index.html, style.css y script.js. Se exporta el contenido guardado sin modificarlo. Los recursos almacenados en el proyecto como resources (path, content, encoding utf8/base64) conservan carpetas y contenido binario; esta versión todavía no ofrece una interfaz para subir recursos separados. Los recursos incrustados en HTML/CSS se conservan; los enlaces externos no se descargan. No se exportan cuentas, conexiones, claves, versiones ni consumo. El servidor rechaza rutas inseguras, nombres reservados, duplicados y secretos de las conexiones del usuario. Solo el propietario puede descargar; una revisión distinta bloquea la exportación para evitar descargar una versión inesperada. Límite: 20 MB y 200 recursos adicionales.
