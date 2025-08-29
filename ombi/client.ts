import axios, { AxiosResponse } from "axios";
import { config } from "dotenv";
import { MovieSearchResult, TVSearchResult } from "./model";
import {
  MovieAlreadyRequestedError,
  NoOmbiResponseError,
  NoRequestPermissions,
  ShowAlreadyRequestedError,
  UnresolvableAddressError,
} from "./errors";

config();

/**
 * Create a new HTTP-based Ombi client instance.
 * @returns A new HttpOmbiClient configured with environment settings
 */
export function newClient(): HttpOmbiClient {
  return new HttpOmbiClient();
}

/**
 * Interface for interacting with an Ombi media server.
 * Provides methods for searching media and submitting requests.
 */
export interface OmbiClient {
  /**
   * Submit a request to add a movie to Ombi.
   * @param address The wallet address of the user making the request
   * @param movieSearchResult The movie search result to request
   * @throws MovieAlreadyRequestedError if the movie has already been requested
   * @throws NoRequestPermissions if the user lacks permission to make requests
   */
  requestMovie(
    address: `0x${string}`,
    movieSearchResult: MovieSearchResult,
  ): Promise<void>;
  /**
   * Submit a request to add a TV show to Ombi.
   * @param address The wallet address of the user making the request
   * @param tvSearchResult The TV show search result to request
   * @throws ShowAlreadyRequestedError if the show has already been requested
   * @throws NoRequestPermissions if the user lacks permission to make requests
   */
  requestTV(
    address: `0x${string}`,
    tvSearchResult: TVSearchResult,
  ): Promise<void>;
  /**
   * Search for movies using the provided search term.
   * @param address The wallet address of the user performing the search
   * @param searchTerm The search query string
   * @returns Array of movie search results
   * @throws Error if search fails or returns invalid data
   */
  searchMovies(
    address: `0x${string}`,
    searchTerm: string,
  ): Promise<MovieSearchResult[]>;
  /**
   * Search for TV shows using the provided search term.
   * @param address The wallet address of the user performing the search
   * @param searchTerm The search query string
   * @returns Array of TV show search results
   * @throws Error if search fails or returns invalid data
   */
  searchTV(
    address: `0x${string}`,
    searchTerm: string,
  ): Promise<TVSearchResult[]>;
}

/**
 * HTTP-based implementation of the OmbiClient interface.
 * Communicates with Ombi via REST API calls and handles authentication
 * through username resolution from wallet addresses.
 */
export class HttpOmbiClient implements OmbiClient {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    const envApiUrl = process.env.OMBI_API_URL;
    if (!envApiUrl) {
      throw "no Ombi API URL found";
    }

    this.apiUrl = envApiUrl;

    const envApiKey = process.env.OMBI_API_KEY;
    if (!envApiKey) {
      throw "no Ombi API key found";
    }
    this.apiKey = envApiKey;
  }

  async executeGet(
    address: `0x${string}`,
    url: string,
  ): Promise<AxiosResponse<Record<string, unknown>>> {
    const username = this.resolveUsername(address);
    if (!username) {
      throw new UnresolvableAddressError(address);
    }

    return await axios({
      url: url,
      method: "GET",
      headers: {
        ApiKey: this.apiKey,
        UserName: username,
      },
    });
  }

  async executePost(
    address: `0x${string}`,
    url: string,
    requestBody: Record<string, unknown>,
  ): Promise<AxiosResponse<Record<string, unknown>>> {
    const username = this.resolveUsername(address);
    if (!username) {
      throw new UnresolvableAddressError(address);
    }

    return await axios({
      url: url,
      method: "POST",
      headers: {
        ApiKey: this.apiKey,
        UserName: username,
      },
      data: requestBody,
    });
  }

  // Throws an error if the response from Ombi is an error.
  handleOmbiError(
    requestURL: string,
    response: AxiosResponse<Record<string, unknown>>,
  ) {
    if (process.env.DEBUG_OMBI_SEARCH) {
      console.log(`response to ${requestURL}:`, response);
    }

    if (!response || !response.data) {
      throw new NoOmbiResponseError(`No Ombi response for ${requestURL}`);
    }

    const data = response.data as Record<string, unknown>;
    if (data.isError) {
      const errorCode =
        typeof data.errorCode === "string" ? data.errorCode : undefined;
      switch (errorCode) {
        case "AlreadyRequested":
          throw new MovieAlreadyRequestedError("Movie already requested");
        case "NoPermissionsRequestMovie":
          return new NoRequestPermissions(
            `User does not have permission to request movies`,
          );
      }

      const errorMessage =
        typeof data.errorMessage === "string" ? data.errorMessage : "";
      if (errorMessage) {
        if (errorMessage.indexOf("already have episodes") >= 0) {
          throw new ShowAlreadyRequestedError("Show already requested");
        }

        // Requesting TV shows without permissions returns a null error code, so use the error message
        if (errorMessage.indexOf("do not have permissions to") >= 0) {
          return new NoRequestPermissions(
            `User does not have permission to request TV shows`,
          );
        }
      }

      throw `Ombi returned an unexpected error code (${errorCode}) with a message: ${errorMessage}`;
    }
  }

  // requestMovie submits a request to add the given MovieSearchResult on behalf of the given address.
  // If the requested movie has already been requested, then MovieAlreadyRequestedError is thrown.
  async requestMovie(
    address: `0x${string}`,
    movieSearchResult: MovieSearchResult,
  ) {
    const requestURL = `${this.apiUrl}/api/v1/request/movie`;
    const response = await this.executePost(address, requestURL, {
      theMovieDbId: movieSearchResult.getId(),
      is4kRequest: false,
    });

    this.handleOmbiError(requestURL, response);
  }

  // requestTV submits a request to add the given TVSearchResult on behalf of the given address.
  // If the requested TV show has already been requested, then MovieAlreadyRequestedError is thrown.
  async requestTV(address: `0x${string}`, tvSearchResult: TVSearchResult) {
    const requestURL = `${this.apiUrl}/api/v2/requests/tv`;
    const response = await this.executePost(address, requestURL, {
      theMovieDbId: tvSearchResult.getId(),
      requestAll: true,
    });

    this.handleOmbiError(requestURL, response);
  }

  // resolveUsername tries to resolve the given address to the associated Ombi username
  resolveUsername(address: `0x${string}`): string | undefined {
    return process.env["USERNAME_" + address];
  }

  // searchMovies returns an array of MovieSearchResult objects describing the results of the search term executed on behalf of the given address.
  async searchMovies(
    address: `0x${string}`,
    searchTerm: string,
  ): Promise<MovieSearchResult[]> {
    const requestURL = `${this.apiUrl}/api/v2/search/multi/${encodeURIComponent(searchTerm)}`;
    const response = await this.executePost(address, requestURL, {
      movies: true,
    });

    await this.handleOmbiError(requestURL, response);

    const data = response.data;
    if (!Array.isArray(data)) {
      throw new Error("Expected array response from Ombi for searchMovies");
    }
    return data.map((result: Record<string, unknown>) => {
      return new MovieSearchResult(
        String(result.id ?? ""),
        String(result.title ?? ""),
      );
    });
  }

  // searchTV returns an array of TVSearchResult objects describing the results of the search term executed on behalf of the given address.
  async searchTV(
    address: `0x${string}`,
    searchTerm: string,
  ): Promise<TVSearchResult[]> {
    const requestURL = `${this.apiUrl}/api/v2/search/multi/${encodeURIComponent(searchTerm)}`;
    const response = await this.executePost(address, requestURL, {
      tvShows: true,
    });

    await this.handleOmbiError(requestURL, response);

    const data = response.data;
    if (!Array.isArray(data)) {
      throw new Error("Expected array response from Ombi for searchTV");
    }
    return Promise.all(
      data.map(async (responseData: Record<string, unknown>) => {
        const showID = String(responseData.id ?? "");
        const showTitle = String(responseData.title ?? "");

        const showDetailsResponse = await this.executeGet(
          address,
          `${this.apiUrl}/api/v2/search/tv/moviedb/${showID}`,
        );
        const details = showDetailsResponse.data as Record<string, unknown>;
        let startDate: Date | undefined = undefined;
        if (details.firstAired) {
          startDate = new Date(String(details.firstAired));
        }
        const seasonCount = Array.isArray(details.seasonRequests)
          ? details.seasonRequests.length
          : 0;
        const status =
          typeof details.status === "string"
            ? details.status.toLowerCase()
            : "";

        return new TVSearchResult(
          showID,
          showTitle,
          startDate,
          seasonCount,
          status,
        );
      }),
    );
  }
}
