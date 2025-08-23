/**
 * Interface for search results that can be displayed in a list.
 * Provides a common way to get display text for different media types.
 */
export interface ListableResult {
  /**
   * Get a string representation of the search result for display in lists.
   * @returns Formatted string suitable for showing to users
   */
  getListText(): string;
}

/**
 * Represents a movie search result from Ombi/TheMovieDB.
 * Contains basic movie information and implements ListableResult for display.
 */
export class MovieSearchResult implements ListableResult {
  private id: string;
  private name: string;

  /**
   * Create a new movie search result.
   * @param id The TheMovieDB ID of the movie
   * @param name The title of the movie
   */
  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  /**
   * Get the TheMovieDB ID of this movie.
   * @returns The movie's provider ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get the title of this movie.
   * @returns The movie's title
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get a formatted string for displaying this movie in a list.
   * @returns The movie title
   */
  getListText(): string {
    return this.name;
  }
}

/**
 * Represents a TV show search result from Ombi/TheMovieDB.
 * Contains TV show information including season count and status.
 */
export class TVSearchResult implements ListableResult {
  private id: string;
  private name: string;
  private startDate: Date;
  private seasonCount: number;
  private status: string;

  /**
   * Create a new TV show search result.
   * @param id The TheMovieDB ID of the TV show
   * @param name The title of the TV show
   * @param startDate The first air date of the show
   * @param seasonCount The number of seasons
   * @param status The current status (e.g., 'ended', 'continuing')
   */
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

  /**
   * Get the TheMovieDB ID of this TV show.
   * @returns The show's provider ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get the title of this TV show.
   * @returns The show's title
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get the number of seasons for this TV show.
   * @returns The season count
   */
  getSeasonCount(): number {
    return this.seasonCount;
  }

  /**
   * Get the current status of this TV show.
   * @returns The show's status (e.g., 'ended', 'continuing')
   */
  getStatus(): string {
    return this.status;
  }

  getListText(): string {
    const seasonText = this.seasonCount == 1 ? "season" : "seasons";
    return `${this.name} (${this.startDate.getUTCFullYear()}) (${this.seasonCount} ${seasonText}, ${this.status})`;
  }
}
