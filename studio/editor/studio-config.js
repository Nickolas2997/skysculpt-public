// Public project configuration. Provider credentials and allowances stay in AWS.
export const studioConfig = Object.freeze({
 ai3dEnabled: true,
 aiTransport: 'aws',
 awsAIEndpoint: 'https://vz58nljdjj.execute-api.eu-north-1.amazonaws.com/default/imagetomesh',
 supabaseURL: 'https://lgldvqtoaqstfwenybsh.supabase.co',
 supabasePublishableKey: 'sb_publishable_gmxvpuKV8BX4L_VlyhgO8w_pVN8Xiku',
 maxAIImageBytes: 4 * 1024 * 1024,
 apiBase: '/api/3d/',
 signInPath: null,
});
export const AI_UNAVAILABLE = 'The AI connection has not been configured.';
