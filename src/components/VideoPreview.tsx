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
      className="w-full max-w-2xl mx-auto bg-card/80 backdrop-blur-md border border-border/80 rounded-2xl overflow-hidden shadow-lg"
    >
      <div className="relative aspect-video bg-muted overflow-hidden">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
        />
        {video.duration && (
          <div className="absolute bottom-3 right-3 bg-background/90 backdrop-blur-md text-foreground text-xs font-semibold px-2.5 py-1 rounded-md shadow">
            {video.duration}
          </div>
        )}
      </div>
      <div className="p-5 space-y-3">
        <h3 className="text-foreground font-display font-semibold text-lg md:text-xl leading-snug line-clamp-2">
          {video.title}
        </h3>
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-xs md:text-sm">
          {video.channel && (
            <span className="flex items-center gap-1.5 font-medium text-foreground/80">
              <User className="h-4 w-4 text-primary" />
              {video.channel}
            </span>
          )}
          {video.views && (
            <span className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              {video.views}
            </span>
          )}
          {video.duration && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {video.duration}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default VideoPreview;
