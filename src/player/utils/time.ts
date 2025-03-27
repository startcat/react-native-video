/*
 * Duration Parser Helper
 *
 */

function segmentDuration(durationInSeconds: number) {

    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = durationInSeconds % 60;
  
    return {
        hours: hours,
        minutes: minutes,
        seconds: seconds
    };

}

export function subtractMinutesFromDate(date: Date, min: number): Date { 
    
    try {
        date.setMinutes(date.getMinutes() - min); 

    } catch(ex){
        console.log(ex.message);
    }
    
    return date;

}

export function parseToCounter (durationInSeconds: number | string): string {

    let seconds = 0;

    if (typeof(durationInSeconds) !== 'number'){
        seconds = parseInt(durationInSeconds, 10);

    } else {
        seconds = durationInSeconds;

    }

    if (seconds < 0){
        seconds = 0;
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