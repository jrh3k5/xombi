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
    constructor(id, name, startDate, seasonCount, status) {
        this.id = id;
        this.name = name;
        this.startDate = startDate;
        this.seasonCount = seasonCount;
        this.status = status;
    }

    // getListText returns a string representation of the movie
    // for showing in the search results list.
    getListText() {
        let seasonText = this.seasonCount == 1 ? "season" : "seasons";
        return `${this.name} (${this.startDate.getUTCFullYear()}) (${this.seasonCount} ${seasonText}, ${this.status})`;
    }
}
