export interface MetadataClassProps {
    id:number;
    title?:string;
    subtitle?:string;
    description?:string;
    poster?: string;
    squaredPoster?: string;
}

export class MetadataClass {

    public id:number;
    public title?:string;
    public subtitle?:string;
    public description?:string;
    public poster?: string;
    public squaredPoster?: string;

    constructor(props:MetadataClassProps) {
        this.id = props.id;
        this.title = props.title;
        this.subtitle = props.subtitle;
        this.description = props.description;
        this.poster = props.poster;
        this.squaredPoster = props.squaredPoster;
    }

}
