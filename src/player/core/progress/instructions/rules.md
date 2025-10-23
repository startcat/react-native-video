# DVR Progress Manager - Reglas Fundamentales

## 📍 **LIVE EDGE Y TIEMPO**

✅ **liveEdge = Date.now()** (o endStreamDate si está definido) - Es el punto del directo actual, igual en todos los modos  
✅ **Ventana DVR crece naturalmente** - Si inicializas con 1h, tras 30min la ventana será 1.5h  
✅ **windowStart se calcula desde seekableRange** - NO desde CMS. windowStart = liveEdge - seekableDuration  
✅ **seekableDuration = seekableRange.end - seekableRange.start** - La fuente de verdad para el tamaño de ventana  
✅ **streamStartTime se calcula dinámicamente** - Basado en seekableRange cuando esté disponible  
✅ **currentTimeWindowSeconds deriva del seekableRange** - NO del valor del CMS inicialmente

## ⏸️ **PAUSA Y BUFFERING**

✅ **Durante pausa: timestamp de posición se congela** - La hora del punto de reproducción no avanza  
✅ **Durante pausa: liveEdgeOffset DEBE crecer** - Cada segundo de pausa aumenta el offset respecto al live edge  
✅ **Timer obligatorio durante pausa** - Player no envía datos en pausa, NOSOTROS emitimos updates cada 1 segundo  
✅ **Updates cada 1 segundo siempre** - En marcha: datos del player. En pausa: nuestro timer interno  
✅ **Distinguir pausa vs buffering** - Ambos congelan el progreso pero son estados diferentes  
✅ **⚠️ VALORES CONSISTENTES EN PAUSA** - Verificar que progressDatum, liveEdgeOffset y otros valores sean coherentes antes de emitir update

## 🚀 **INICIALIZACIÓN Y TAMAÑO DE VENTANA**

✅ **NO necesitamos setDVRWindowSeconds para inicializar** - seekableRange del player es suficiente  
✅ **seekableRange es la fuente de verdad** - Prevalece sobre cualquier valor del CMS  
✅ **updatePlayerData con seekableRange válido = listo para calcular** - No esperar más datos  
✅ **setDVRWindowSeconds es opcional** - Solo para referencia, NO bloqueante para funcionalidad  
✅ **windowStart se calcula desde seekableRange** - liveEdge - seekableDuration  
✅ **Marcar como inicializado cuando tengamos seekableRange válido** - \_isInitialized cuando seekableRange.end > 0

## 🎯 **DATOS DEL REPRODUCTOR**

✅ **currentTime = segundos desde inicio de ventana DVR** - Base para todos los cálculos  
✅ **seekableRange viene del player/cast** - Es LA fuente de verdad para límites temporales  
✅ **seekableDuration = seekableRange.end - seekableRange.start** - Tamaño real de la ventana DVR  
✅ **NO hay duration en streams en directo** - Solo aplica a VOD  
✅ **Normalizar datos entre player/cast** - Pueden venir en formatos ligeramente distintos  
✅ **⚠️ seekableRange prevalece sobre CMS** - El player conoce la realidad temporal

## 🧮 **CÁLCULOS FUNDAMENTALES**

✅ **seekableDuration = seekableRange.end - seekableRange.start** - Tamaño real de ventana (NO del CMS)  
✅ **windowStart = liveEdge - seekableDuration \* 1000** - Inicio GLOBAL de la ventana DVR (independiente del modo)  
✅ **progressDatum = windowStart + (currentTime \* 1000)** - Timestamp absoluto del punto de reproducción  
✅ **liveEdgeOffset = (liveEdge - progressDatum) / 1000** - Segundos por detrás del live edge  
✅ **currentTime del player es SIEMPRE relativo a windowStart** - NO al programa en modo PLAYLIST  
✅ **Los cálculos base son independientes del modo** - WINDOW, PROGRAM, PLAYLIST usan la misma base  
✅ **Los modos solo afectan al SLIDER (UI)** - minimumValue/maximumValue cambian, pero progressDatum NO  
✅ **⚠️ Validar coherencia antes de emitir** - Especialmente durante pausas y cambios de estado

## 🎮 **MODOS DE REPRODUCCIÓN**

### WINDOW (por defecto)

✅ **Slider representa toda la ventana** - De windowStart a liveEdge  
✅ **Inicia en liveEdge** - Reproducción comienza en directo  
✅ **EPG se consulta por cambios significativos** - Callback onEPGRequest cada X segundos de diferencia

### PROGRAM

✅ **Se activa pasándole datos de programa específico** - No parte del programa en directo actual  
✅ **Como WINDOW pero mínimo = inicio del programa que le pasamos** - El slider no puede ir más atrás  
✅ **Inicia en el inicio del programa indicado** - NO en liveEdge, NO en programa actual  
✅ **Máximo sigue siendo liveEdge** - No el final del programa

### PLAYLIST

✅ **Slider se adapta al programa actual** - minimumValue = program.startDate, maximumValue = program.endDate  
✅ **SIEMPRE inicia en liveEdge** - Como WINDOW, independiente de isLiveProgramRestricted  
✅ **isLiveProgramRestricted solo afecta navegación** - Limita el slider al programa, NO cambia posición inicial  
✅ **progressDatum sigue siendo global** - Se calcula desde windowStart, NO desde program.startDate  
✅ **El slider muestra el programa, pero la ventana DVR es más amplia** - Usuario no puede ir más atrás del programa  
✅ **Cambio automático de programa** - Cuando reproducción llega al final del programa actual  
✅ **goToLive puede cambiar programa** - Si liveEdge está en siguiente programa

## 🔄 **NAVEGACIÓN Y SEEKING**

✅ **goToLive() siempre va al liveEdge actual** - seekableRange.end en términos del player  
✅ **Seek valida contra seekableRange** - Clamp entre seekableRange.start y seekableRange.end  
✅ **Manual seeking usa eventos de slider** - onSlidingStart/Move/Complete, NO timers de 3 segundos  
✅ **Eventos slider**: onSlidingStart → activar manual seeking, onSlidingComplete → desactivar  
✅ **Métodos disponibles**: skipForward, skipBackward, seekToProgress, seekToTime, goToLive, goToProgramStart

## 📺 **EPG Y PROGRAMAS**

✅ **EPG se consulta por timestamp** - getEPGProgramAt(progressDatum)  
✅ **Reintentos en caso de error** - Con delays progresivos  
✅ **Callbacks específicos**: onEPGRequest, onEPGError, onProgramChange, onModeChange  
✅ **Programa actual almacenado** - \_currentProgram con startDate, endDate, etc.

## 🔄 **ESTADOS Y VALIDACIÓN**

✅ **Estado válido requiere**: seekableRange.end > 0, currentTime >= 0, hasReceivedPlayerData = true  
✅ **⚠️ NO requiere dvrWindowSeconds del CMS** - seekableRange es suficiente para operación  
✅ **isLiveEdgePosition**: offset <= LIVE_EDGE_TOLERANCE segundos  
✅ **isProgramLive**: programa actual según EPG no ha terminado Y estamos cerca del liveEdge  
✅ **isLiveStream**: indica que reproducimos directo (DVR), NO un VOD - siempre true en DVR  
✅ **Inicialización progresiva**: hasReceivedPlayerData → seekableRange válido → isInitialized  
✅ **⚠️ Validación extra durante pausas** - Verificar consistencia de valores antes de emitir updates

## 🏗️ **ARQUITECTURA**

✅ **BaseProgressManager**: funcionalidad común entre VOD y DVR  
✅ **DVRProgressManagerClass**: hereda de Base, añade lógica específica DVR  
✅ **ProgressManagerUnified**: fachada que unifica VOD y DVR managers  
✅ **Callbacks configurables**: onProgressUpdate, onSeekRequest, onValidationError + específicos DVR  
✅ **Sistema de logs** - Con niveles debug/info/warn/error y LOG_ENABLED  
✅ **⚠️ Sistema de errores PlayerError** - TODOS los managers DEBEN usar PlayerError (ver src/player/core/errors/instructions/ErrorSystem.md)

## ⚠️ **INVARIANTES CRÍTICOS**

✅ **seekableRange es LA fuente de verdad** - Prevalece sobre cualquier dato del CMS  
✅ **liveEdge es SIEMPRE global** - No depende del modo de reproducción  
✅ **Ventana crece EN TIEMPO REAL** - No solo cuando se reciben datos  
✅ **Offset crece durante pausa** - En todos los modos DVR  
✅ **currentTime viene del reproductor** - No se calcula, se recibe como dato  
✅ **seekableRange define límites del player** - No se sobrescribe con lógica DVR  
✅ **seekableRange válido = operación posible** - No esperar datos adicionales del CMS  
✅ **Timer obligatorio en pausa** - Player no envía datos, nosotros SÍ cada 1 segundo  
✅ **⚠️ Consistencia antes de emitir** - Validar que progressDatum, liveEdgeOffset y otros valores sean coherentes  
✅ **⚠️ windowStart se calcula dinámicamente** - Siempre desde liveEdge - seekableDuration

## 🎯 **CAMBIOS CLAVE RESPECTO A VERSIÓN ANTERIOR**

🔄 **setDVRWindowSeconds ya NO es bloqueante** - La funcionalidad no depende de este valor  
🔄 **seekableRange del player es autoridad** - Determina tamaño real de ventana DVR  
🔄 **Inicialización más temprana** - En cuanto tengamos seekableRange válido  
🔄 **Validación reforzada durante pausas** - Evitar inconsistencias en values durante estados de pausa  
🔄 **windowStart calculado dinámicamente** - Siempre actualizado basado en datos reales del player
