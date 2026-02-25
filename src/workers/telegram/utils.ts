/**
 * Telegram message/file extraction utilities
 */

export type FileInfo = {
	file_id: string;
	file_unique_id: string;
	file_size?: number;
	file_name?: string;
	type: string;
};

export function extractFilesFromMessage(message: Record<string, unknown>): FileInfo[] {
	const files: FileInfo[] = [];
	const doc = message.document as { file_id: string; file_unique_id: string; file_size?: number; file_name?: string } | undefined;
	if (doc) {
		files.push({ file_id: doc.file_id, file_unique_id: doc.file_unique_id, file_size: doc.file_size, file_name: doc.file_name, type: "document" });
	}
	const photo = message.photo as Array<{ file_id: string; file_unique_id: string; file_size?: number }> | undefined;
	if (photo?.length) {
		const largest = photo[photo.length - 1];
		files.push({ file_id: largest.file_id, file_unique_id: largest.file_unique_id, file_size: largest.file_size, type: "photo" });
	}
	const video = message.video as { file_id: string; file_unique_id: string; file_size?: number; file_name?: string } | undefined;
	if (video) {
		files.push({ file_id: video.file_id, file_unique_id: video.file_unique_id, file_size: video.file_size, file_name: video.file_name, type: "video" });
	}
	const audio = message.audio as { file_id: string; file_unique_id: string; file_size?: number; file_name?: string } | undefined;
	if (audio) {
		files.push({ file_id: audio.file_id, file_unique_id: audio.file_unique_id, file_size: audio.file_size, file_name: audio.file_name, type: "audio" });
	}
	const voice = message.voice as { file_id: string; file_unique_id: string; file_size?: number } | undefined;
	if (voice) {
		files.push({ file_id: voice.file_id, file_unique_id: voice.file_unique_id, file_size: voice.file_size, type: "voice" });
	}
	const videoNote = message.video_note as { file_id: string; file_unique_id: string; file_size?: number } | undefined;
	if (videoNote) {
		files.push({ file_id: videoNote.file_id, file_unique_id: videoNote.file_unique_id, file_size: videoNote.file_size, type: "video_note" });
	}
	const animation = message.animation as { file_id: string; file_unique_id: string; file_size?: number; file_name?: string } | undefined;
	if (animation) {
		files.push({ file_id: animation.file_id, file_unique_id: animation.file_unique_id, file_size: animation.file_size, file_name: animation.file_name, type: "animation" });
	}
	const sticker = message.sticker as { file_id: string; file_unique_id: string; file_size?: number } | undefined;
	if (sticker) {
		files.push({ file_id: sticker.file_id, file_unique_id: sticker.file_unique_id, file_size: sticker.file_size, type: "sticker" });
	}
	return files;
}
