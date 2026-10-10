# Validación del chat que edita proyectos

## Google AI Studio y Cerebras Cloud

Revisión adicional de documentación oficial: precios y cuotas Gemini, catálogo y cuotas Cerebras. Los modelos proceden de ListModels, no de una lista fija de IDs. Se añadió comprobación de caducidad de precios Google y pruebas de retirada del nivel gratuito y fallo de consulta de precios: Solo gratuitos devuelve 409 sin enviar inferencia ni seleccionar otro modelo. Las 16 pruebas automatizadas pasan. Persistencia y respaldo se verificaron con claves ficticias; requieren claves reales para confirmar acceso efectivo al catálogo, permisos de inferencia, cuotas/saldo y crear/modificar/deshacer con respuestas reales de ambos proveedores. El nivel de facturación Google sigue siendo declarado por el usuario: la API de catálogo no lo verifica.

Pruebas con claves ficticias: catálogo Google paginado y exclusión de embeddings, autenticación en cabeceras sin claves en URL, Gemini generateContent y Cerebras Chat Completions, Plan sin escritura, Build con respaldo, filtro gratuito según precios oficiales y nivel declarado, almacenamiento cifrado, aislamiento, reemplazo/eliminación, logout y reinicio. La consulta pública de precios de Google confirma nivel gratuito para Gemini 2.5 Flash/Flash-Lite; no se afirma disponibilidad para una cuenta específica. Cerebras documenta créditos de prueba temporales, no modelos siempre gratuitos. No hay una prueba de inferencia real con estos dos proveedores: requiere sus claves.

Fecha: 10 de octubre de 2026, America/Mexico_City.

Las seis pruebas de `npm test` pasan. Incluyen autenticación, aislamiento entre usuarios, validación del contrato JSON, rechazo de rutas arbitrarias, sustituciones ambiguas y JavaScript inválido, creación/edición/deshacer y rechazo de una respuesta tardía después de otro guardado.

## Prueba real desde la interfaz

Proveedor: OpenRouter. Modelo: `openai/gpt-4.1-mini`. Proyecto independiente: «Prueba real · Crear editar deshacer». Clave conectada por el usuario en la sesión del navegador, sin copiarla a archivos o registros.

1. Crear página Jardín Lunar con estilos verdes y un contador: se guardaron los tres archivos y aparecieron en sus pestañas. La vista previa mostró el título y el botón. Un clic cambió «Clics: 0» a «Clics: 1».
2. Cambiar únicamente Jardín Lunar a Jardín Solar: la respuesta del chat informó modificación de `index.html`. El HTML resultante coincidió exactamente con la sustitución del título, y CSS/JavaScript coincidieron exactamente con sus versiones previas. La vista previa mostró Jardín Solar.
3. Deshacer: HTML, CSS y JavaScript coincidieron exactamente con la versión creada en el paso 1. La vista previa volvió a Jardín Lunar.
4. Preguntar cómo funciona el contador, sin pedir modificaciones: respondió con una explicación. Los tres archivos conservaron exactamente su contenido.

Evidencia visual local: `validation-chat.png`. La prueba real cubre OpenRouter; Groq fue validado con respuestas simuladas. No se afirma una prueba real de Groq.

## Catálogo y apertura automática de archivos

Las nueve pruebas automatizadas actuales pasan. Añaden clasificación de precios, búsqueda gratuita, protección del filtro en el servidor y cuota agotada sin reintento con otro modelo ni escritura de archivos.

Por petición del usuario, la nueva prueba de generación en navegador usa respuestas simuladas, una clave ficticia y datos temporales independientes. El catálogo sí procede de la API pública real de OpenRouter: 458 modelos, de los cuales 19 tenían precios gratuitos confirmados en esta consulta.

1. Buscar `free` y `gratis` produjo exactamente los mismos 19 modelos, todos etiquetados FREE.
2. Crear una página desde la pestaña CSS abrió inmediatamente `index.html`, guardó los tres archivos y mostró el título y contador en la vista previa.
3. Modificar únicamente CSS abrió `style.css`. El editor mostró `color: blue` y la vista previa confirmó `rgb(0, 0, 255)`.
4. Deshacer restauró `color: green` y la vista previa confirmó `rgb(0, 128, 0)`.
5. Solo gratuitos permaneció activado tras recargar. Combinarlo con DE PAGO dejó la selección vacía y mostró que no había modelos gratuitos confirmados; no seleccionó un modelo de pago.

Groq no expone precios, plan de la cuenta ni cuota restante en su catálogo. La elegibilidad documentada usa una consulta a la tabla oficial del 10 de octubre de 2026 con vigencia de 24 horas y requiere declarar el plan gratuito. Al vencer o faltar datos, el precio queda NO CONFIRMADO. No se ha probado una llamada real nueva a Groq ni una generación real con el catálogo nuevo.

## Conexiones persistentes cifradas

### OpenCode Zen — 10 de octubre de 2026

La consulta real, sin clave, de `/zen/v1/models` devolvió 87 modelos. El cruce con la documentación oficial vigente confirmó 12 gratuitos y dejó `claude-sonnet-4` y `muse-spark-1.2-contributor-free` sin precio confirmado. Se encontraron Chat Completions, Responses, Messages, Gemini y System One; los modelos cuyo protocolo no aparece en la tabla no se ejecutan por suposición.

Las 14 pruebas actuales pasan. Con claves y respuestas simuladas se verificaron formato de cada protocolo, Plan sin escritura, Build con respaldo/deshacer, filtro gratuito en servidor, errores 401/402/429/503, documentación inaccesible, cifrado sin texto claro, reemplazo y eliminación, logout y reinicio de servidor y aislamiento entre cuentas. System One se limita a decisiones estructuradas en Plan. No hay clave Zen real configurada para esta prueba; la inferencia real y los permisos/cuotas efectivos quedan pendientes.

Se verificó también un cambio de precio durante una caché previamente gratuita: la siguiente petición Solo gratuitos volvió a consultar la documentación, bloqueó el modelo de pago y no envió inferencia. El servidor final respondió HTTP 200 para `/` y `/app.js`, sin errores de arranque. La nueva prueba visual del navegador no pudo completarse: la política del navegador integrado bloqueó seleccionar la pestaña aislada de pruebas. No se afirma una validación visual nueva ni inferencia real Zen.

Once pruebas automatizadas pasan. Se comprobaron AES-256-GCM, rechazo al alterar etiqueta/usuario/proveedor, archivo maestro externo y ausencia de claves en texto claro en la base de datos. La integración cierra y vuelve a abrir el servidor HTTP cargando nuevamente la base de datos y la clave maestra: ambas conexiones se recuperan tras iniciar sesión. También verifica logout, acceso aislado por usuario, probar/reemplazar/eliminar, conservación de conexión ante reemplazo inválido y rechazo de secretos en archivos y respuestas del modelo.

En navegador con cuenta temporal y clave ficticia, guardar mostró OpenRouter conectado con últimos cuatro caracteres enmascarados, probar confirmó conexión válida, logout vació editor/proyectos/chat/formulario/conexiones visibles y login recuperó la conexión sin volver a introducirla. Evidencia: `validation-connections.png`. Las llamadas de validación a proveedores fueron simuladas; no se afirma una conexión real nueva.

## Retirada de proveedores — 10 de octubre de 2026

OpenCode Zen y Cerebras retirados de la interfaz, tutoriales, catálogo y rutas del servidor. Al arrancar se eliminan sus conexiones persistentes. npm test: 16 pruebas aprobadas, incluida la denegación de conexiones y consultas a ambos proveedores. Servidor reiniciado: HTTP 200, sin errores en el registro y cero conexiones retiradas en la base de datos.

## Panel de consumo — 10 de octubre de 2026

21 pruebas aprobadas. Simulaciones de OpenRouter, Groq y Gemini verifican costo reportado/estimado/desconocido, gratuidad, tokens de razonamiento, cuotas, límites separados de Google y reserva de salida. Integración verifica Plan/Build, errores de validación, reintentos, persistencia tras reinicio y aislamiento entre usuarios. No se realizaron llamadas de inferencia con claves reales en esta tarea.

## Descargar proyecto

23 pruebas aprobadas. ZIP validado también con System.IO.Compression de Windows. Descarga real en navegador de escritorio desde cuenta temporal aislada: se editó HTML y nombre sin guardar y Descargar proyecto guardó ambos; Prueba descarga.zip contiene la última edición, style.css y script.js. Se comprobaron solicitudes con User-Agent Android y escritorio; la prueba en dispositivo Android físico queda pendiente. No se descargan recursos externos; el modelo actual del editor contiene tres archivos y permite exportar recursos adicionales si ya están almacenados en el proyecto.

## Identidad visual y respaldo automático

24 pruebas aprobadas. Logo y video del usuario servidos localmente; video muted/loop/playsinline, respuesta HTTP con rangos para móvil, capa oscura y paleta azul/plateada. Preferencia de movimiento reducido y pestaña oculta pausan la reproducción. Respaldo 429 simulado desde OpenRouter a Gemini: aplica Build, guarda versión, informa modelo de respaldo y registra ambos intentos. Con Solo gratuitos activo y sin otra opción gratuita disponible, rechaza sin ejecutar el modelo de pago. Se corrigió el manejo de errores del catálogo y se comprueban precios vigentes en cada intento. Inferencia real no realizada en esta tarea.
