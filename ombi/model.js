export class MovieSearchResult {
    constructor(id, name) {
        this.id = id;
        this.name = name;
    }

    // getListText returns a string representation of the movie
    // for showing in the search results list.
    getListText() {
        return this.name;
    }
}

export class TVSearchResult {
    constructor(id, name, startDate) {
        this.id = id;
        this.name = name;
        this.startDate = startDate;
    }

    // getListText returns a string representation of the movie
    // for showing in the search results list.
    getListText() {
        return `${this.name} (${this.startDate.getUTCFullYear()})`
    }
}
