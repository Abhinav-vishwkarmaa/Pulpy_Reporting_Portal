import axios from 'axios';

/**
 * Attempts to fetch ISP information from a third-party API.
 * @param {string} ip 
 * @returns {Promise<string|null>} ISP Name or null
 */
export async function getISP(ip) {
    if (!ip || ip === '127.0.0.1' || ip.includes(':')) {
        return null;
    }

    try {
        const url = `http://ip-api.com/json/${ip}?fields=isp,mobile`;
        const response = await axios.get(url, {
            timeout: 1000
        });

        if (response.data && response.data.isp) {
            return response.data.isp;
        }
    } catch (error) {
        return null;
    }
    return null;
}
