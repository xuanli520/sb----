package cn.edu.training.novel;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class NovelPlatformApplication {
    public static void main(String[] args) { SpringApplication.run(NovelPlatformApplication.class, args); }
}
