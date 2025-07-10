/*
 * Duration Parser Helper
 *
 */

function segmentDuration(durationInSeconds: number) {

    const hours = typeof(durationInSeconds) === 'number' ? Math.floor(durationInSeconds / 3600) : 0;
    const minutes = typeof(durationInSeconds) === 'number' ? Math.floor((durationInSeconds % 3600) / 60) : 0;
    const seconds = typeof(durationInSeconds) === 'number' ? durationInSeconds % 60 : 0;
  
    return {
        hours: hours,
        minutes: minutes,
        seconds: seconds
    };

}

export function subtractMinutesFromDate(date: Date, min: number): Date { 
    
    try {
        date.setMinutes(date.getMinutes() - min); 

    } catch(ex: unknown){
        console.log(ex instanceof Error ? ex.message : 'Unknown error');
    }
    
    return date;

}

export function parseToCounter (durationInSeconds: number | string): string {

    let seconds = 0;

    if (typeof(durationInSeconds) !== 'number'){
        seconds = parseInt(durationInSeconds, 10);

    } else if (typeof(durationInSeconds) === 'number'){
        seconds = durationInSeconds;

    }

    // Validar que el valor sea razonable para duraciones de contenido multimedia
    if (
        !Number.isFinite(seconds) ||
        seconds < 0 ||
        seconds > 86400 || // Más de 24 horas en segundos (contenido muy largo)
        seconds > 1000000000000 // Detectar timestamps Unix en milisegundos (demasiado grande)
    ) {
        return '00:00';
    }

    // Si parece ser un timestamp Unix (valores muy grandes), rechazar
    if (seconds > 1000000000) { // Timestamp Unix (mayor a ~31 años en segundos)
        return '00:00';
    }

    const segments = segmentDuration(seconds);

    const segmentsToString = {
        hours: segments.hours.toFixed(0).padStart(2, '0'),
        minutes: segments.minutes.toFixed(0).padStart(2, '0'),
        seconds: segments.seconds.toFixed(0).padStart(2, '0')
    };

    if (segmentsToString.hours === '00'){
        return `${segmentsToString.minutes}:${segmentsToString.seconds}`;

    } else {
        return `${segmentsToString.hours}:${segmentsToString.minutes}:${segmentsToString.seconds}`;

    }

};

export function parseToDetails (durationInSeconds: number | string): string {

    let seconds = 0;

    if (typeof(durationInSeconds) !== 'number'){
        seconds = parseInt(durationInSeconds, 10);

    } else {
        seconds = durationInSeconds;

    }

    if (seconds < 0){
        seconds = 0;
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes){
        return `${minutes}min`;

    } else {
        return ``;

    }

};