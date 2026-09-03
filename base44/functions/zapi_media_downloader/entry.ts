import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { message_id, media_url, media_type } = await req.json();

        if (!media_url) return Response.json({ status: "skipped" });

        const CLIENT_TOKEN = Deno.env.get("ZAPI_SECURITY_TOKEN");

        // Download from Z-API (or external URL)
        const headers = {};
        if (media_url.includes('z-api.io') && CLIENT_TOKEN) {
             headers['client-token'] = CLIENT_TOKEN;
        }

        const response = await fetch(media_url, { headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        
        // Determine extension from type
        let ext = 'bin';
        if (blob.type.includes('jpeg') || blob.type.includes('jpg')) ext = 'jpg';
        else if (blob.type.includes('png')) ext = 'png';
        else if (blob.type.includes('webp')) ext = 'webp';
        else if (blob.type.includes('pdf')) ext = 'pdf';
        else if (blob.type.includes('ogg') || blob.type.includes('audio')) ext = 'ogg';
        else if (blob.type.includes('mp4') || blob.type.includes('video')) ext = 'mp4';
        else if (media_type === 'IMAGE') ext = 'jpg';
        else if (media_type === 'AUDIO') ext = 'ogg';
        else if (media_type === 'DOC') ext = 'doc';

        const file = new File([blob], `media_${message_id}.${ext}`, { type: blob.type });

        // Upload to Base44 Storage
        const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: file });

        // Update Message with internal URL
        await base44.asServiceRole.entities.Message.update(message_id, {
            media_file_id: file_url // Using the URL as ID for now or if we had an Attachment entity
        });

        return Response.json({ status: "success", file_url });

    } catch (error) {
        console.error("Error in zapi_media_downloader:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});