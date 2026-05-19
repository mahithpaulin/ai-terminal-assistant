
import axios from "axios";
import fs from "fs";
import path from "path";

export class ConnectiveUtil {
    private config: any;

    constructor() {
        const configPath = path.join(process.cwd(), "connective-config.json");
        this.config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }

    async executeAgentCommand(command: string) {
        try {
            const response = await axios.post(`${this.config.network.agent_runtime}/execute`, { command });
            return response.data;
        } catch (error) {
            console.error("Failed to execute agent command:", error);
            return null;
        }
    }

    async updateWorldConfig(config: any) {
        try {
            const response = await axios.post(`${this.config.network.awe_engine}/config`, config);
            return response.data;
        } catch (error) {
            console.error("Failed to update world config:", error);
            return null;
        }
    }
}

