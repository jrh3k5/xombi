import axios, { AxiosHeaders } from "axios";
import { HttpOmbiClient } from "./client";
import {
  MovieAlreadyRequestedError,
  NoOmbiResponseError,
  NoRequestPermissions,
  ShowAlreadyRequestedError,
  UnresolvableAddressError,
} from "./errors";
import { MovieSearchResult, TVSearchResult } from "./model";

jest.mock("axios");
const mockedAxios = axios as jest.MockedFunction<typeof axios>;

describe("HttpOmbiClient", () => {
  const address = "0x123" as `0x${string}`;
  const apiUrl = "https://ombi.example.com";
  const apiKey = "test-api-key";
  let client: HttpOmbiClient;

  beforeEach(() => {
    process.env.OMBI_API_URL = apiUrl;
    process.env.OMBI_API_KEY = apiKey;
    process.env["USERNAME_0x123"] = "testuser";
    client = new HttpOmbiClient();
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("throws if OMBI_API_URL is missing", () => {
      delete process.env.OMBI_API_URL;
      expect(() => new HttpOmbiClient()).toThrow("no Ombi API URL found");
    });
    it("throws if OMBI_API_KEY is missing", () => {
      process.env.OMBI_API_URL = apiUrl;
      delete process.env.OMBI_API_KEY;
      expect(() => new HttpOmbiClient()).toThrow("no Ombi API key found");
    });
  });

  describe("resolveUsername", () => {
    it("returns username for address", () => {
      expect(client.resolveUsername(address)).toBe("testuser");
    });
    it("returns undefined if not found", () => {
      expect(client.resolveUsername("0x999" as `0x${string}`)).toBeUndefined();
    });
  });

  describe("executeGet", () => {
    it("throws UnresolvableAddressError if no username", async () => {
      const badClient = new HttpOmbiClient();
      delete process.env["USERNAME_0x123"];
      await expect(
        badClient.executeGet("0x123" as `0x${string}`,"/api/test")
      ).rejects.toThrow(UnresolvableAddressError);
    });
    it("calls axios with correct params", async () => {
      mockedAxios.mockResolvedValueOnce({ data: { result: true } });
      await client.executeGet(address, "/api/test");
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/api/test",
          method: "GET",
          headers: expect.objectContaining({ ApiKey: apiKey, UserName: "testuser" }),
        })
      );
    });
  });

  describe("executePost", () => {
    it("throws UnresolvableAddressError if no username", async () => {
      const badClient = new HttpOmbiClient();
      delete process.env["USERNAME_0x123"];
      await expect(
        badClient.executePost("0x123" as `0x${string}`,"/api/test", { foo: "bar" })
      ).rejects.toThrow(UnresolvableAddressError);
    });
    it("calls axios with correct params", async () => {
      mockedAxios.mockResolvedValueOnce({ data: { result: true } });
      await client.executePost(address, "/api/test", { foo: "bar" });
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/api/test",
          method: "POST",
          headers: expect.objectContaining({ ApiKey: apiKey, UserName: "testuser" }),
          data: { foo: "bar" },
        })
      );
    });
  });

  // Helper to create a mock AxiosResponse
  function mockAxiosResponse(data: unknown): import("axios").AxiosResponse<Record<string, unknown>> {
    return {
      data: data as Record<string, unknown>,
      status: 200,
      statusText: "OK",
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    };
  }

  describe("handleOmbiError", () => {

    it("throws NoOmbiResponseError if no data", () => {
      expect(() => client.handleOmbiError("/api", mockAxiosResponse(undefined))).toThrow(NoOmbiResponseError);
    });
    it("throws MovieAlreadyRequestedError on AlreadyRequested", () => {
      expect(() =>
        client.handleOmbiError("/api", mockAxiosResponse({ isError: true, errorCode: "AlreadyRequested" }))
      ).toThrow(MovieAlreadyRequestedError);
    });
    it("returns NoRequestPermissions on NoPermissionsRequestMovie", () => {
      expect(
        client.handleOmbiError("/api", mockAxiosResponse({ isError: true, errorCode: "NoPermissionsRequestMovie" }))
      ).toBeInstanceOf(NoRequestPermissions);
    });
    it("throws ShowAlreadyRequestedError on errorMessage", () => {
      expect(() =>
        client.handleOmbiError("/api", mockAxiosResponse({ isError: true, errorMessage: "already have episodes" }))
      ).toThrow(ShowAlreadyRequestedError);
    });
    it("returns NoRequestPermissions on permissions errorMessage", () => {
      expect(
        client.handleOmbiError("/api", mockAxiosResponse({ isError: true, errorMessage: "do not have permissions to" }))
      ).toBeInstanceOf(NoRequestPermissions);
    });
    it("throws generic error for unknown error", () => {
      expect(() =>
        client.handleOmbiError("/api", mockAxiosResponse({ isError: true, errorCode: "Other", errorMessage: "fail" }))
      ).toThrow(/Ombi returned an unexpected error code/);
    });
  });

  // Integration-like tests for searchMovies and searchTV
  describe("searchMovies", () => {
    it("returns MovieSearchResult array", async () => {
      mockedAxios.mockResolvedValueOnce({ data: [ { id: 1, title: "Movie 1" }, { id: 2, title: "Movie 2" } ] });
      const results = await client.searchMovies(address, "test");
      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(MovieSearchResult);
      expect(results[0].getId()).toBe("1");
      expect(results[0].getName()).toBe("Movie 1");
    });
    it("throws if response is not array", async () => {
      mockedAxios.mockResolvedValueOnce({ data: {} });
      await expect(client.searchMovies(address, "test")).rejects.toThrow("Expected array response");
    });
  });

  describe("searchTV", () => {
    it("returns TVSearchResult array", async () => {
      mockedAxios.mockResolvedValueOnce({ data: [ { id: 1, title: "Show 1" } ] });
      mockedAxios.mockResolvedValueOnce({ data: { firstAired: "2020-01-01", seasonRequests: [1,2], status: "Continuing" } });
      const results = await client.searchTV(address, "test");
      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(TVSearchResult);
      expect(results[0].getName()).toBe("Show 1");
      expect(results[0].getSeasonCount()).toBe(2);
      expect(results[0].getStatus()).toBe("continuing");
    });
    it("throws if response is not array", async () => {
      mockedAxios.mockResolvedValueOnce({ data: {} });
      await expect(client.searchTV(address, "test")).rejects.toThrow("Expected array response");
    });
  });
});
