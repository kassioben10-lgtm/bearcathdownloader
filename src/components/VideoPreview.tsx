import { motion } from "framer-motion";
import { Clock, Eye, User } from "lucide-react";

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: string;
  views: string;
  channel: string;
}

interface VideoPreviewProps {
  video: VideoInfo;
}

const VideoPreview = ({ video }: VideoPreviewProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl mx-auto bg-card border border-border rounded-xl overflow-hidden"
    >
      <div className="relative aspect-video">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm text-foreground text-xs font-medium px-2 py-1 rounded-md">
          {video.duration}
        </div>
      </div>
      <div className="p-4 space-y-2">
        <h3 className="text-foreground font-display font-semibold text-lg leading-tight line-clamp-2">
          {video.title}
        </h3>
        <div className="flex items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {video.channel}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {video.views}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {video.duration}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default VideoPreview;
