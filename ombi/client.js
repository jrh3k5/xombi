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

    // requestMovie submits a request to add the given MovieSearchResult on behalf of the given address.
    // If the requested movie has already been requested, then MovieAlreadyRequestedError is thrown.
    async requestMovie(address, movieSearchResult) {
        const result = await this.executePost(address, `${this.apiURL}/api/v1/request/movie`, {
            theMovieDbId: movieSearchResult.id,
            is4kRequest: false,
        });

        if (result && result.data && result.data.errorCode === "AlreadyRequested") {
            throw MovieAlreadyRequestedError;
        }
    }

    // requestTV submits a request to add the given TVSearchResult on behalf of the given address.
    // If the requested TV show has already been requested, then MovieAlreadyRequestedError is thrown.
    async requestTV(address, tvSearchResult) {
        const result = await this.executePost(address, `${this.apiURL}/api/v2/requests/tv`, {
            theMovieDbId: tvSearchResult.id,
            requestAll: true
        })

        if (result && result.data && result.data.errorMessage && result.data.errorMessage.indexOf("already have episodes") >= 0) {
            throw ShowAlreadyRequestedError;
        }
    }

    // resolveUsername tries to resolve the given address to the associated Ombi username
    resolveUsername(address) {
        return process.env["USERNAME_" + address];
    }

    // searchMovies returns an array of MovieSearchResult objects describing the results of the search term executed on behalf of the given address.
    async searchMovies(address, searchTerm) {
        const response = await this.executePost(address, `${this.apiURL}/api/v2/search/multi/${encodeURIComponent(searchTerm)}`, {
            movies: true
        })
        return response.data.map(result => {
            return new MovieSearchResult(result.id, result.title);
        });
    }

    // searchTV returns an array of TVSearchResult objects describing the results of the search term executed on behalf of the given address.
    async searchTV(address, searchTerm) {
        const response = await this.executePost(address, `${this.apiURL}/api/v2/search/multi/${encodeURIComponent(searchTerm)}`, {
            tvShows: true
        });
        return response.data.map(result => {
            return new TVSearchResult(result.id, result.title);
        })
    }
}