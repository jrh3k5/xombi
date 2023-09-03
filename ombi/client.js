import axios from 'axios';
import dotenv from 'dotenv';
import { MovieSearchResult } from './model.js';

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

    executeGet(address, url) {
        console.log("getting URL", url);
        const username = process.env["USERNAME_" + address]
        if (!username) {
            return new Promise((_, reject) => {
                reject(`Unable to resolve username for address ${address}`)
            })
        }

        return axios({
            url: url,
            method: "GET",
            headers: {
                // Without this, Axios chokes on the response
                "Accept-Encoding": "gzip,deflate",
                ApiKey: this.apiKey,
                UserName: username
            }
        });
    }

    // searchMovies returns a Promise that resolves to an array of MovieSearchResult objects
    // describing the results of the search term executed on behalf of the given address.
    searchMovies(address, searchTerm) {
        return this.executeGet(address, `${this.apiURL}/api/v1/Search/movie/${encodeURIComponent(searchTerm)}`).then(response => {
            return response.data.map(result => {
                return new MovieSearchResult(result.title, new Date(result.releaseDate), result.theMovieDbId);
            })
        })
    }
}