import axios, { AxiosInstance } from "axios";

import { ExtensionSettings } from "../../interfaces/extensionSettings";

export class WisdomAPI {
  private axiosInstance: AxiosInstance;
  private settings: ExtensionSettings;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
    this.axiosInstance = axios.create({
      baseURL: this.settings.wisdomService.basePath + "/api/ai",
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  public async getData(urlPath: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(urlPath);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  public async postData(urlPath: string, inputData: any): Promise<any> {
    try {
      const response = await this.axiosInstance.post(urlPath, inputData);
      return response.data;
    } catch (error) {
      console.error(`Error posting data to ${urlPath}: ${error}`);
      return [];
    }
  }
}
