export interface CatalogConfig {
  catalogUrls: string[];
  moduleSummaryUrl: string;
  latestReleaseUrl: string
};

const config: CatalogConfig = {
  catalogUrls: ['https://cloud-native-toolkit.github.io/automation-solutions/index.yaml','https://modules.cloudnativetoolkit.dev/index.yaml'],
  moduleSummaryUrl: 'https://modules.cloudnativetoolkit.dev/summary.yaml',
  latestReleaseUrl: 'https://api.github.com/repos/cloud-native-toolkit/iascable/releases/latest'
};

export default config;
