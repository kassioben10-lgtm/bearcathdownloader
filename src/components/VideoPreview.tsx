import { motion } from "framer-motion";
import { Clock, Eye, User } from "lucide-react";

export interface VideoInfo {
  title: string;
  rawTitle?: string;
  artist?: string;
  album?: string;
  year?: string;
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
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-background/90 text-primary border border-primary/20 backdrop-blur-md shadow">
            Capa HD Embutida
          </span>
        </div>
        {video.duration && (
          <div className="absolute bottom-3 right-3 bg-background/90 backdrop-blur-md text-foreground text-xs font-semibold px-2.5 py-1 rounded-md shadow">
            {video.duration}
          </div>
        )}
      </div>
      <div className="p-5 space-y-3">
        <div>
          <h3 className="text-foreground font-display font-semibold text-lg md:text-xl leading-snug line-clamp-2">
            {video.title}
          </h3>
          {video.rawTitle && video.rawTitle !== video.title && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 italic">
              Original: {video.rawTitle}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-xs md:text-sm">
          {video.artist ? (
            <span className="flex items-center gap-1.5 font-medium text-foreground/90">
              <User className="h-4 w-4 text-primary" />
              Artista: <span className="text-primary font-semibold">{video.artist}</span>
            </span>
          ) : video.channel ? (
            <span className="flex items-center gap-1.5 font-medium text-foreground/80">
              <User className="h-4 w-4 text-primary" />
              {video.channel}
            </span>
          ) : null}
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
