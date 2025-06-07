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

// newClient creates a new instance of OmbiClient that can be used to interact with Ombi.
export function newClient(): HttpOmbiClient {
  return new HttpOmbiClient();
}

export interface OmbiClient {
  searchMovies(
    address: `0x${string}`,
    searchTerm: string,
  ): Promise<MovieSearchResult[]>;
  searchTV(
    address: `0x${string}`,
    searchTerm: string,
  ): Promise<TVSearchResult[]>;
}

// OmbiClient is a client used to interact with Ombi
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
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<AxiosResponse<any, any>> {
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
    requestBody,
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<AxiosResponse<any, any>> {
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
  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleOmbiError(requestURL: string, response: AxiosResponse<any, any>) {
    if (process.env.DEBUG_OMBI_SEARCH) {
      console.log(`response to ${requestURL}:`, response);
    }

    if (!response || !response.data) {
      throw new NoOmbiResponseError(`No Ombi response for ${requestURL}`);
    }

    if (response.data.isError) {
      switch (response.data.errorCode) {
        case "AlreadyRequested":
          throw new MovieAlreadyRequestedError("Movie already requested");
        case "NoPermissionsRequestMovie":
          return new NoRequestPermissions(
            `User does not have permission to request movies`,
          );
      }

      if (response.data.errorMessage) {
        if (response.data.errorMessage.indexOf("already have episodes") >= 0) {
          throw new ShowAlreadyRequestedError("Show already requested");
        }

        // Requesting TV shows without permissions returns a null error code, so use the error message
        if (
          response.data.errorMessage.indexOf("do not have permissions to") >= 0
        ) {
          return new NoRequestPermissions(
            `User does not have permission to request TV shows`,
          );
        }
      }

      throw `Ombi returned an unexpected error code (${response.data.errorCode}) with a message: ${response.data.errorMessage}`;
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

    return response.data.map((result) => {
      return new MovieSearchResult(result.id, result.title);
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

    return Promise.all(
      response.data.map(async (responseData) => {
        const showID = responseData.id;
        const showTitle = responseData.title;

        const showDetailsResponse = await this.executeGet(
          address,
          `${this.apiUrl}/api/v2/search/tv/moviedb/${showID}`,
        );
        const startDate = new Date(showDetailsResponse.data.firstAired);
        const seasonCount = (showDetailsResponse.data.seasonRequests || [])
          .length;
        const status = (showDetailsResponse.data.status || "").toLowerCase();

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
