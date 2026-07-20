package cn.edu.training.novel.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final InternalApiAuthInterceptor internalApiAuthInterceptor;
    public WebConfig(InternalApiAuthInterceptor internalApiAuthInterceptor) { this.internalApiAuthInterceptor = internalApiAuthInterceptor; }
    @Override public void addInterceptors(InterceptorRegistry registry) { registry.addInterceptor(internalApiAuthInterceptor).addPathPatterns("/api/v1/**"); }
}
