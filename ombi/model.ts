// ListableResult describes a search result that can be listed.
export interface ListableResult {
  // getListText returns a string representation of the search result
  // for showing in the search results list.
  getListText(): string;
}

export class MovieSearchResult implements ListableResult {
  private id: string;
  private name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getListText(): string {
    return this.name;
  }
}

export class TVSearchResult implements ListableResult {
  private id: string;
  private name: string;
  private startDate: Date;
  private seasonCount: number;
  private status: string;

  constructor(
    id: string,
    name: string,
    startDate: Date,
    seasonCount: number,
    status: string,
  ) {
    this.id = id;
    this.name = name;
    this.startDate = startDate;
    this.seasonCount = seasonCount;
    this.status = status;
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  getSeasonCount(): number {
    return this.seasonCount;
  }

  getStatus(): string {
    return this.status;
  }

  getListText(): string {
    const seasonText = this.seasonCount == 1 ? "season" : "seasons";
    return `${this.name} (${this.startDate.getUTCFullYear()}) (${this.seasonCount} ${seasonText}, ${this.status})`;
  }
}
