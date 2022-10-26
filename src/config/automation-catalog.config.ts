export interface AutomationCatalogConfig {
  catalogUrls: string[];
  moduleSummaryUrl: string;
  latestReleaseUrl: string
};

const config: AutomationCatalogConfig = {
  catalogUrls: process.env.AUTOMATION_CATALOGS ? JSON.parse(process.env.AUTOMATION_CATALOGS) : ["https://cloud-native-toolkit.github.io/automation-solutions/index.yaml","https://modules.cloudnativetoolkit.dev/index.yaml"],
  moduleSummaryUrl: 'https://modules.cloudnativetoolkit.dev/summary.yaml',
  latestReleaseUrl: 'https://api.github.com/repos/cloud-native-toolkit/iascable/releases/latest'
};

export default config;
