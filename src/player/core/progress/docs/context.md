Este modulo core del Player, consiste en ofrecer los gestores del progreso del reproductor, para manejar los sliders tanto en VOD como en lives con DVR.

Disponemos de la clase BaseProgressManager, con la base compartida entre ambas modalidades. Luego generamos las clases VODProgressManagerClass y DVRProgressManagerClass con sus particularidades.

La clase VODProgressManagerClass es senzilla, puesto que un VOD siempre va del 0 a la duración del contenido.

La clase DVRProgressManager se encarga de gestionar la barra de progreso de un reproductor de video y audio, al usar streams con DVR (timeshift).
Como usaremos streams con DVR, siempre necesitaremos conocer el tamaño de la ventana, en segundos, al cargar el stream. A partir de este valor, podremos realizar los cálculos de los valores que necesitamos, como por ejemplo, a qué hora se corresponde el punto en el que estamos reproduciendo.
La clase se encargará de ir gestionando el crecimiento natural de la ventana. Es decir, conforme avance el tiempo, la ventana irá creciendo. Si por ejemplo inicializamos la reproducción del stream con una ventana de 1h, tras 30 minutos de reproducción, la ventana será de 1,5h.
Si el usuario pausa la reproducción, veremos como la hora del punto en el que esta reproduciendo se mantiene, y como el liveEdgeOffset (segundos por detrás del liveEdge) va creciendo.

La clase recibirá los datos que emitirá o el reproductor de video o el gestor de chromecast. Datos como el currentTime y el seekableRange. No dispondremos de una duración, ya que en un directo no aplica.

Hay que tener en cuenta que el reproductor de video y el gestor de chromecast, pueden dar los valores en un formato ligeramente distinto. Así que deberíamos pasarlos por una función que los normalizara si fuera necesario.

En principio los valores han de llegar como:

- currentTime: segundos desde el inicio del window de DVR. Por tanto, al inicializar la reproducción, debemos guardar la hora y la cantidad de minutos de la ventana inicial.

Le indicaremos a la clase cuando el usuario hace pausa y cuando el reproductor (video o cast) están haciendo buffering y por tanto se detiene la reproducción.

La clase tiene conectada una EPG, que mediante la hora calculada del punto de reproducción, nos dirá qué se está reproduciendo, a qué hora ha empezado y a qué hora terminará.

La clase ofrece varios métodos, como:

- ir al edge live
- ir a una hora concreta
- avanzar un tiempo determinado
- retroceder un tiempo determinado
- ir al inicio de la ventana de tiempo (lo más atrás posible)

Disponemos de varios modos de reproducción, con una gestión distinta de la barra de progreso: Window, Program y Playlist.

Modo WINDOW:

- Es el modo por defecto.
- El slider nos permite movernos por toda la ventana de tiempo.
- Empezamos la reproducción en el liveEdge.
- Si nos desplazamos más de N segundos, simplemente porque transcurre el tiempo y no estamos pausados, o por haber realizado un seek, debemos lanzar un callback (onEPGRequest) que indique que debemos consultar la EPG en la fecha/hora del punto de reproducción, para actualizar los datos del programa que estamos viendo (si ha cambiado).
- En la derecha de todo del slider, tendremos el liveEdge, y en la izquierda, el punto inicial de la ventana. Por tanto conforme la ventana crezca, el slider representará un espacio mayor.

Modo Program:

- El comportamiento será como el tipo WINDOW, pero el valor inferior del slider, será el beginDate de un programa de la EPG. En la derecha del slider, tendremos el edge live, no el fin del programa de la EPG.
- Además, al entrar en este modo, empezaremos a reproducir desde el inicio del programa, no desde el edge live.
- Igual que con el modo Window, iremos revisando si hemos cambiado de programa en la EPG.
- Es decir, es como el modo Window pero iniciando el slider en una fecha superior a la del inicio de la ventana de tiempo.
- El usuario no podrá hacer seek más atrás de la fecha de inicio, ya que a nivel de UI no lo permitirá el slider.

Modo Playlist:

- Este es el método más sofisticado. Consiste en adaptar el slider al programa actual de la EPG.
- Empezamos la reproducción en el liveEdge.
- Antes de mostrar el slider, consultaremos qué programa se está emitiendo (getEPGProgramAt)
- El slider representará la duración del programa (startDate - endDate).
- Sin embargo, como el programa esta en directo, el valor del liveEdge será inferior al maximumValue del slider.
- El usuario no podrá desplazarse al programa anterior, a pesar de que la ventana lo permitiera, ya que la hora de inicio del programa se corresponde con el minimumValue del slider.
- Cuando el punto de reproducción alcance el final del slider, cogeremos la información del siguiente programa en la EPG y reiniciaremos los valores del slider, con los del nuevo programa.
- Si el usuario va, imaginemos, 30 minutos por detrás del liveEdge, veremos como hay un momento en que el valor del liveEdge alcanza o supera el maximumValue del slider. Todavía no saltaremos al siguiente programa, ya que como hemos definido, esto lo haremos cuando la reproducción llegue al final, no cuando el directo cambie de programa. Si el usuario quiere ir al liveEdge, y el liveEdge ya esta en el siguiente programa, actualizaremos los valores del slider con los del programa en directo y realizaremos el seek.
- Si el usuario va, imaginemos, 30 minutos por detrás del liveEdge, y llega al final del programa que esta viendo, refrescaremos los valores del slider con los del siguiente programa. En ese momento, veremos que la reproducción continua 30 minutos por detrás del liveEdge.

La clase se encargará por tanto de calcular los datos necesarios, que renderizaremos con un react-native-awesome-slider.
