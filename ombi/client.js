import axios from 'axios';
import dotenv from 'dotenv';
import { MovieSearchResult, TVSearchResult } from './model.js';
import { MovieAlreadyRequestedError, ShowAlreadyRequestedError } from './errors.js'

dotenv.config();

// newClient creates a new instance of OmbiClient that can be used to interact with Ombi.
export function newClient() {
    return new OmbiClient();
}

class OmbiClient {
    constructor() {
        this.apiURL = process.env.OMBI_API_URL;
        if (!this.apiURL) {
            throw 'no Ombi API URL found';
        }

        this.apiKey = process.env.OMBI_API_KEY;
        if (!this.apiKey) {
            throw 'no Ombi API key found';
        }
    }

    async executeGet(address, url) {
        const username = this.resolveUsername(address);
        if (!username) {
            return new Promise((_, reject) => {
                reject(`Unable to resolve username for address ${address}`)
            })
        }

        return await axios({
            url: url,
            method: "GET",
            headers: {
                ApiKey: this.apiKey,
                UserName: username
            }
        });
    }

    async executePost(address, url, requestBody) {
        const username = this.resolveUsername(address);
        if (!username) {
            return new Promise((_, reject) => {
                reject(`Unable to resolve username for address ${address}`)
            })
        }

        return await axios({
            url: url,
            method: "POST",
            headers: {
                ApiKey: this.apiKey,
                UserName: username
            },
            data: requestBody
        });
    }

    // Throws an error if the response from Ombi is an error.
    handleOmbiError(requestURL, response) {
        if (process.env.DEBUG_OMBI_SEARCH) {
            console.log(`response to ${requestURL}:`, response);
        }

        if (!response || !response.data) {
            throw 'no response from Ombi';
        }

        if (response.data.isError) {
            if (response.data.errorCode === "AlreadyRequested") {
                throw MovieAlreadyRequestedError;
            }

            if (response.data.errorMessage && response.data.errorMessage.indexOf("already have episodes") >= 0) {
                throw ShowAlreadyRequestedError;
            }

            throw `Ombi returned an unexpected error code(${response.data.errorCode}) with a message: ${response.data.errorMessage}`
        }
    }

    // requestMovie submits a request to add the given MovieSearchResult on behalf of the given address.
    // If the requested movie has already been requested, then MovieAlreadyRequestedError is thrown.
    async requestMovie(address, movieSearchResult) {
        const requestURL = `${this.apiURL}/api/v1/request/movie`;
        const response = await this.executePost(address, requestURL, {
            theMovieDbId: movieSearchResult.id,
            is4kRequest: false,
        });

        this.handleOmbiError(requestURL, response);
    }

    // requestTV submits a request to add the given TVSearchResult on behalf of the given address.
    // If the requested TV show has already been requested, then MovieAlreadyRequestedError is thrown.
    async requestTV(address, tvSearchResult) {
        const requestURL = `${this.apiURL}/api/v2/requests/tv`;
        const response = await this.executePost(address, requestURL, {
            theMovieDbId: tvSearchResult.id,
            requestAll: true
        })

        this.handleOmbiError(requestURL, response);
    }

    // resolveUsername tries to resolve the given address to the associated Ombi username
    resolveUsername(address) {
        return process.env["USERNAME_" + address];
    }

    // searchMovies returns an array of MovieSearchResult objects describing the results of the search term executed on behalf of the given address.
    async searchMovies(address, searchTerm) {
        const requestURL = `${this.apiURL}/api/v2/search/multi/${encodeURIComponent(searchTerm)}`;
        const response = await this.executePost(address, requestURL, {
            movies: true
        })

        this.handleOmbiError(requestURL, response);

        return response.data.map(result => {
            return new MovieSearchResult(result.id, result.title);
        });
    }

    // searchTV returns an array of TVSearchResult objects describing the results of the search term executed on behalf of the given address.
    async searchTV(address, searchTerm) {
        const requestURL = `${this.apiURL}/api/v2/search/multi/${encodeURIComponent(searchTerm)}`;
        const response = await this.executePost(address, requestURL, {
            tvShows: true
        });

        this.handleOmbiError(requestURL, response);

        const tvShows = [];
        for (let responseIndex = 0; responseIndex < response.data.length; responseIndex++) {
            const responseData = response.data[responseIndex];
            const showID = responseData.id;
            const showTitle = responseData.title;

            const showDetailsResponse = await this.executeGet(address, `${this.apiURL}/api/v2/search/tv/moviedb/${showID}`);
            const startDate = new Date(showDetailsResponse.data.firstAired);

            tvShows.push(new TVSearchResult(showID, showTitle, startDate));
        }

        return tvShows;
    }
}